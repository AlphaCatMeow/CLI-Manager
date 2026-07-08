use chrono::{Local, NaiveDate};
use local_ip_address::local_ip;
use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use sysinfo::{
    CpuRefreshKind, Disks, Networks, Pid, ProcessRefreshKind, ProcessesToUpdate, RefreshKind,
    System, UpdateKind,
};

const TOP_PROCESS_LIMIT: usize = 5;
const EXPENSIVE_REFRESH_INTERVAL: Duration = Duration::from_secs(8);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemResourceSnapshotOptions {
    full_detail: Option<bool>,
    system: Option<bool>,
    cpu: Option<bool>,
    memory: Option<bool>,
    network: Option<bool>,
    disk: Option<bool>,
    gpu: Option<bool>,
    processes: Option<bool>,
}

#[derive(Clone, Copy)]
struct SamplingOptions {
    system: bool,
    cpu: bool,
    memory: bool,
    network: bool,
    disk: bool,
    gpu: bool,
    processes: bool,
}

impl SamplingOptions {
    fn from_args(
        full_detail: Option<bool>,
        options: Option<SystemResourceSnapshotOptions>,
    ) -> Self {
        let full_detail = options
            .as_ref()
            .and_then(|value| value.full_detail)
            .or(full_detail)
            .unwrap_or(true);
        let default_extra = full_detail;
        let default_core = true;
        let options = options.as_ref();

        Self {
            system: options
                .and_then(|value| value.system)
                .unwrap_or(default_core),
            cpu: options.and_then(|value| value.cpu).unwrap_or(default_core),
            memory: options
                .and_then(|value| value.memory)
                .unwrap_or(default_core),
            network: options
                .and_then(|value| value.network)
                .unwrap_or(default_extra),
            disk: options
                .and_then(|value| value.disk)
                .unwrap_or(default_extra),
            gpu: options.and_then(|value| value.gpu).unwrap_or(default_extra),
            processes: options
                .and_then(|value| value.processes)
                .unwrap_or(default_extra),
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SystemResourceSnapshot {
    ip_address: Option<String>,
    os_name: String,
    host_name: Option<String>,
    uptime_seconds: u64,
    sampled_at: u64,
    cpu: CpuSnapshot,
    cpu_cores: Vec<CpuCoreSnapshot>,
    gpu: Option<GpuSnapshot>,
    memory: MemorySnapshot,
    network: NetworkSnapshot,
    disks: Vec<DiskSnapshot>,
    top_processes: Vec<ProcessSnapshot>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CpuSnapshot {
    usage_percent: f32,
    core_count: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CpuCoreSnapshot {
    index: usize,
    usage_percent: f32,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GpuSnapshot {
    usage_percent: f32,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemorySnapshot {
    total_bytes: u64,
    used_bytes: u64,
    available_bytes: u64,
    cached_bytes: u64,
    free_bytes: u64,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct NetworkSnapshot {
    upload_bytes_per_sec: u64,
    download_bytes_per_sec: u64,
    total_uploaded_bytes: u64,
    total_downloaded_bytes: u64,
    today_uploaded_bytes: u64,
    today_downloaded_bytes: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiskSnapshot {
    name: String,
    mount_point: String,
    file_system: String,
    total_bytes: u64,
    available_bytes: u64,
    used_bytes: u64,
    read_bytes_per_sec: u64,
    write_bytes_per_sec: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProcessSnapshot {
    pid: String,
    name: String,
    command: String,
    cpu_usage_percent: f32,
    memory_bytes: u64,
    memory_usage_percent: f32,
}

struct ResourceCollector {
    system: System,
    networks: Networks,
    disks: Disks,
    gpu: Option<GpuCollector>,
    memory: MemoryCollector,
    cached_ip_address: Option<String>,
    cached_network: NetworkSnapshot,
    network_daily_baseline: Option<NetworkDailyBaseline>,
    cached_disks: Vec<DiskSnapshot>,
    cached_gpu: Option<GpuSnapshot>,
    cached_top_processes: Vec<ProcessSnapshot>,
    last_system_refresh: Option<Instant>,
    last_network_refresh: Option<Instant>,
    last_disk_refresh: Option<Instant>,
    last_gpu_refresh: Option<Instant>,
    last_process_refresh: Option<Instant>,
}

impl ResourceCollector {
    fn new() -> Self {
        Self {
            system: System::new_with_specifics(
                RefreshKind::nothing().with_cpu(CpuRefreshKind::everything()),
            ),
            networks: Networks::new(),
            disks: Disks::new(),
            gpu: None,
            memory: MemoryCollector::new(),
            cached_ip_address: None,
            cached_network: NetworkSnapshot::default(),
            network_daily_baseline: None,
            cached_disks: Vec::new(),
            cached_gpu: None,
            cached_top_processes: Vec::new(),
            last_system_refresh: None,
            last_network_refresh: None,
            last_disk_refresh: None,
            last_gpu_refresh: None,
            last_process_refresh: None,
        }
    }

    fn snapshot(&mut self, options: SamplingOptions) -> SystemResourceSnapshot {
        if options.cpu {
            self.system.refresh_cpu_usage();
        }
        if options.memory {
            self.system.refresh_memory();
        }

        let now = Instant::now();
        if options.system && self.should_refresh_system(now) {
            self.cached_ip_address = local_ip().ok().map(|ip| ip.to_string());
            self.last_system_refresh = Some(now);
        }
        if options.processes && self.should_refresh_processes(now) {
            self.system.refresh_processes_specifics(
                ProcessesToUpdate::All,
                true,
                ProcessRefreshKind::nothing()
                    .with_memory()
                    .with_cpu()
                    .without_tasks(),
            );
            let top_pids = collect_top_process_pids(&self.system);
            if !top_pids.is_empty() {
                self.system.refresh_processes_specifics(
                    ProcessesToUpdate::Some(&top_pids),
                    false,
                    ProcessRefreshKind::nothing()
                        .with_cmd(UpdateKind::OnlyIfNotSet)
                        .without_tasks(),
                );
            }
            self.cached_top_processes = collect_top_processes(&self.system, &top_pids);
            self.last_process_refresh = Some(now);
        }
        if options.disk && self.should_refresh_disks(now) {
            let elapsed_secs = self
                .last_disk_refresh
                .map(|last| now.duration_since(last).as_secs_f64().max(0.001))
                .unwrap_or(0.001);
            self.disks.refresh(self.disks.list().is_empty());
            self.cached_disks = collect_disks(&self.disks, elapsed_secs);
            self.last_disk_refresh = Some(now);
        }
        if options.network && self.should_refresh_network(now) {
            self.cached_network = self.sample_network(now);
        }
        if options.gpu && self.should_refresh_gpu(now) {
            self.cached_gpu = self.gpu.get_or_insert_with(GpuCollector::new).sample();
            self.last_gpu_refresh = Some(now);
        }

        let cpu_cores = if options.cpu {
            self.system
                .cpus()
                .iter()
                .enumerate()
                .map(|(index, cpu)| CpuCoreSnapshot {
                    index: index + 1,
                    usage_percent: clamp_percent(cpu.cpu_usage()),
                })
                .collect::<Vec<_>>()
        } else {
            Vec::new()
        };

        SystemResourceSnapshot {
            ip_address: if options.system {
                self.cached_ip_address.clone()
            } else {
                None
            },
            os_name: System::long_os_version()
                .or_else(System::name)
                .unwrap_or_else(|| "Unknown".to_string()),
            host_name: System::host_name(),
            uptime_seconds: System::uptime(),
            sampled_at: current_epoch_millis(),
            cpu: CpuSnapshot {
                usage_percent: if options.cpu {
                    clamp_percent(self.system.global_cpu_usage())
                } else {
                    0.0
                },
                core_count: self.system.cpus().len(),
            },
            cpu_cores,
            gpu: if options.gpu {
                self.cached_gpu.clone()
            } else {
                None
            },
            memory: if options.memory {
                self.memory.sample(&self.system)
            } else {
                MemorySnapshot::default()
            },
            network: if options.network {
                self.cached_network.clone()
            } else {
                NetworkSnapshot::default()
            },
            disks: if options.disk {
                self.cached_disks.clone()
            } else {
                Vec::new()
            },
            top_processes: if options.processes {
                self.cached_top_processes.clone()
            } else {
                Vec::new()
            },
        }
    }

    fn should_refresh_system(&self, now: Instant) -> bool {
        should_refresh(self.last_system_refresh, now)
    }

    fn should_refresh_network(&self, now: Instant) -> bool {
        self.last_network_refresh
            .map(|last| now.duration_since(last) >= Duration::from_secs(1))
            .unwrap_or(true)
    }

    fn should_refresh_disks(&self, now: Instant) -> bool {
        self.cached_disks.is_empty() || should_refresh(self.last_disk_refresh, now)
    }

    fn should_refresh_gpu(&self, now: Instant) -> bool {
        should_refresh(self.last_gpu_refresh, now)
    }

    fn should_refresh_processes(&self, now: Instant) -> bool {
        self.cached_top_processes.is_empty() || should_refresh(self.last_process_refresh, now)
    }

    fn sample_network(&mut self, now: Instant) -> NetworkSnapshot {
        let previous_refresh = self.last_network_refresh;
        let elapsed_secs = now
            .duration_since(previous_refresh.unwrap_or(now))
            .as_secs_f64()
            .max(0.001);

        self.networks.refresh(true);
        self.last_network_refresh = Some(now);

        let mut received = 0_u64;
        let mut transmitted = 0_u64;
        let mut total_received = 0_u64;
        let mut total_transmitted = 0_u64;
        for (_, data) in &self.networks {
            received = received.saturating_add(data.received());
            transmitted = transmitted.saturating_add(data.transmitted());
            total_received = total_received.saturating_add(data.total_received());
            total_transmitted = total_transmitted.saturating_add(data.total_transmitted());
        }
        let (today_uploaded_bytes, today_downloaded_bytes) =
            self.today_network_totals(total_transmitted, total_received);

        NetworkSnapshot {
            upload_bytes_per_sec: previous_refresh
                .map(|_| bytes_per_second(transmitted, elapsed_secs))
                .unwrap_or(0),
            download_bytes_per_sec: previous_refresh
                .map(|_| bytes_per_second(received, elapsed_secs))
                .unwrap_or(0),
            total_uploaded_bytes: total_transmitted,
            total_downloaded_bytes: total_received,
            today_uploaded_bytes,
            today_downloaded_bytes,
        }
    }

    fn today_network_totals(
        &mut self,
        total_uploaded_bytes: u64,
        total_downloaded_bytes: u64,
    ) -> (u64, u64) {
        network_daily_totals(
            &mut self.network_daily_baseline,
            Local::now().date_naive(),
            total_uploaded_bytes,
            total_downloaded_bytes,
        )
    }
}

#[derive(Clone, Copy)]
struct NetworkDailyBaseline {
    day: NaiveDate,
    total_uploaded_bytes: u64,
    total_downloaded_bytes: u64,
}

fn network_daily_totals(
    baseline: &mut Option<NetworkDailyBaseline>,
    day: NaiveDate,
    total_uploaded_bytes: u64,
    total_downloaded_bytes: u64,
) -> (u64, u64) {
    let baseline_value = match *baseline {
        Some(value)
            if value.day == day
                && total_uploaded_bytes >= value.total_uploaded_bytes
                && total_downloaded_bytes >= value.total_downloaded_bytes =>
        {
            value
        }
        _ => {
            let value = NetworkDailyBaseline {
                day,
                total_uploaded_bytes,
                total_downloaded_bytes,
            };
            *baseline = Some(value);
            value
        }
    };

    (
        total_uploaded_bytes.saturating_sub(baseline_value.total_uploaded_bytes),
        total_downloaded_bytes.saturating_sub(baseline_value.total_downloaded_bytes),
    )
}

fn should_refresh(last_refresh: Option<Instant>, now: Instant) -> bool {
    last_refresh
        .map(|last| now.duration_since(last) >= EXPENSIVE_REFRESH_INTERVAL)
        .unwrap_or(true)
}

fn collect_disks(disks: &Disks, elapsed_secs: f64) -> Vec<DiskSnapshot> {
    disks
        .iter()
        .map(|disk| {
            let total = disk.total_space();
            let available = disk.available_space();
            let usage = disk.usage();
            DiskSnapshot {
                name: disk.name().to_string_lossy().to_string(),
                mount_point: disk.mount_point().to_string_lossy().to_string(),
                file_system: disk.file_system().to_string_lossy().to_string(),
                total_bytes: total,
                available_bytes: available,
                used_bytes: total.saturating_sub(available),
                read_bytes_per_sec: bytes_per_second(usage.read_bytes, elapsed_secs),
                write_bytes_per_sec: bytes_per_second(usage.written_bytes, elapsed_secs),
            }
        })
        .collect()
}

fn collect_top_process_pids(system: &System) -> Vec<Pid> {
    let mut processes = system
        .processes()
        .iter()
        .map(|(pid, process)| (*pid, process))
        .collect::<Vec<_>>();

    processes.sort_by(|(_, a), (_, b)| {
        b.cpu_usage()
            .partial_cmp(&a.cpu_usage())
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| b.memory().cmp(&a.memory()))
    });

    processes
        .into_iter()
        .take(TOP_PROCESS_LIMIT)
        .map(|(pid, _)| pid)
        .collect()
}

fn collect_top_processes(system: &System, top_pids: &[Pid]) -> Vec<ProcessSnapshot> {
    let total_memory = system.total_memory().max(1);

    top_pids
        .iter()
        .filter_map(|pid| system.process(*pid).map(|process| (*pid, process)))
        .map(|(pid, process)| {
            let memory_bytes = process.memory();
            let command = process
                .cmd()
                .iter()
                .map(|part| part.to_string_lossy())
                .collect::<Vec<_>>()
                .join(" ");
            ProcessSnapshot {
                pid: pid.to_string(),
                name: process.name().to_string_lossy().to_string(),
                command,
                cpu_usage_percent: process.cpu_usage().max(0.0),
                memory_bytes,
                memory_usage_percent: clamp_percent(
                    (memory_bytes as f32 / total_memory as f32) * 100.0,
                ),
            }
        })
        .collect()
}

fn bytes_per_second(bytes: u64, elapsed_secs: f64) -> u64 {
    ((bytes as f64) / elapsed_secs).round().max(0.0) as u64
}

fn clamp_percent(value: f32) -> f32 {
    if value.is_finite() {
        value.clamp(0.0, 100.0)
    } else {
        0.0
    }
}

fn current_epoch_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or(0)
}

static COLLECTOR: OnceLock<Mutex<ResourceCollector>> = OnceLock::new();

#[tauri::command]
pub fn system_resources_get_snapshot(
    full_detail: Option<bool>,
    options: Option<SystemResourceSnapshotOptions>,
) -> Result<SystemResourceSnapshot, String> {
    let collector = COLLECTOR.get_or_init(|| Mutex::new(ResourceCollector::new()));
    let mut collector = collector
        .lock()
        .map_err(|_| "system_resource_collector_poisoned".to_string())?;
    Ok(collector.snapshot(SamplingOptions::from_args(full_detail, options)))
}

#[cfg(target_os = "windows")]
struct MemoryCollector {
    inner: Option<MemoryPdhQuery>,
}

#[cfg(not(target_os = "windows"))]
struct MemoryCollector;

#[cfg(not(target_os = "windows"))]
impl MemoryCollector {
    fn new() -> Self {
        Self
    }

    fn sample(&mut self, system: &System) -> MemorySnapshot {
        let total = system.total_memory();
        let used = system.used_memory().min(total);
        let available = system.available_memory().min(total);
        let free = system.free_memory().min(total);
        let cached = total.saturating_sub(used).saturating_sub(free);

        MemorySnapshot {
            total_bytes: total,
            used_bytes: used,
            available_bytes: available,
            cached_bytes: cached,
            free_bytes: free,
        }
    }
}

#[cfg(target_os = "windows")]
impl MemoryCollector {
    fn new() -> Self {
        Self {
            inner: MemoryPdhQuery::new().ok(),
        }
    }

    fn sample(&mut self, system: &System) -> MemorySnapshot {
        let total = system.total_memory();
        let used = system.used_memory().min(total);
        let available = system.available_memory().min(total);
        let counters = self.inner.as_mut().and_then(MemoryPdhQuery::sample);

        MemorySnapshot {
            total_bytes: total,
            used_bytes: used,
            available_bytes: available,
            cached_bytes: counters
                .as_ref()
                .map_or(0, |value| value.cached_bytes.min(total)),
            free_bytes: counters.map_or_else(
                || system.free_memory().min(total),
                |value| value.free_bytes.min(total),
            ),
        }
    }
}

#[cfg(target_os = "windows")]
struct MemoryPdhSample {
    cached_bytes: u64,
    free_bytes: u64,
}

#[cfg(target_os = "windows")]
struct MemoryPdhQuery {
    query: windows_sys::Win32::System::Performance::PDH_HQUERY,
    cache_counter: windows_sys::Win32::System::Performance::PDH_HCOUNTER,
    free_counter: windows_sys::Win32::System::Performance::PDH_HCOUNTER,
}

// PDH handles are only accessed through ResourceCollector's global Mutex.
#[cfg(target_os = "windows")]
unsafe impl Send for MemoryPdhQuery {}

#[cfg(target_os = "windows")]
impl MemoryPdhQuery {
    fn new() -> Result<Self, ()> {
        use windows_sys::Win32::System::Performance::{
            PdhAddEnglishCounterW, PdhCollectQueryData, PdhOpenQueryW, PDH_HCOUNTER, PDH_HQUERY,
        };

        let mut query: PDH_HQUERY = std::ptr::null_mut();
        let mut cache_counter: PDH_HCOUNTER = std::ptr::null_mut();
        let mut free_counter: PDH_HCOUNTER = std::ptr::null_mut();
        let cache_path = wide_null(r"\Memory\Cache Bytes");
        let free_path = wide_null(r"\Memory\Free & Zero Page List Bytes");

        unsafe {
            if PdhOpenQueryW(std::ptr::null(), 0, &mut query) != 0 {
                return Err(());
            }
            if PdhAddEnglishCounterW(query, cache_path.as_ptr(), 0, &mut cache_counter) != 0 {
                let _ = windows_sys::Win32::System::Performance::PdhCloseQuery(query);
                return Err(());
            }
            if PdhAddEnglishCounterW(query, free_path.as_ptr(), 0, &mut free_counter) != 0 {
                let _ = windows_sys::Win32::System::Performance::PdhCloseQuery(query);
                return Err(());
            }
            let _ = PdhCollectQueryData(query);
        }

        Ok(Self {
            query,
            cache_counter,
            free_counter,
        })
    }

    fn sample(&mut self) -> Option<MemoryPdhSample> {
        use windows_sys::Win32::System::Performance::PdhCollectQueryData;

        unsafe {
            if PdhCollectQueryData(self.query) != 0 {
                return None;
            }
        }

        Some(MemoryPdhSample {
            cached_bytes: read_pdh_u64(self.cache_counter)?,
            free_bytes: read_pdh_u64(self.free_counter)?,
        })
    }
}

#[cfg(target_os = "windows")]
impl Drop for MemoryPdhQuery {
    fn drop(&mut self) {
        unsafe {
            let _ = windows_sys::Win32::System::Performance::PdhCloseQuery(self.query);
        }
    }
}

#[cfg(target_os = "windows")]
fn read_pdh_u64(counter: windows_sys::Win32::System::Performance::PDH_HCOUNTER) -> Option<u64> {
    use windows_sys::Win32::System::Performance::{
        PdhGetFormattedCounterValue, PDH_FMT_COUNTERVALUE, PDH_FMT_LARGE,
    };

    let mut value = PDH_FMT_COUNTERVALUE::default();
    let mut value_type = 0_u32;
    unsafe {
        if PdhGetFormattedCounterValue(counter, PDH_FMT_LARGE, &mut value_type, &mut value) != 0 {
            return None;
        }
        if value.CStatus != 0 {
            return None;
        }
        let bytes = value.Anonymous.largeValue;
        (bytes >= 0).then_some(bytes as u64)
    }
}

#[cfg(target_os = "windows")]
struct GpuCollector {
    inner: Option<GpuPdhQuery>,
}

#[cfg(not(target_os = "windows"))]
struct GpuCollector;

#[cfg(not(target_os = "windows"))]
impl GpuCollector {
    fn new() -> Self {
        Self
    }

    fn sample(&mut self) -> Option<GpuSnapshot> {
        None
    }
}

#[cfg(target_os = "windows")]
impl GpuCollector {
    fn new() -> Self {
        Self {
            inner: GpuPdhQuery::new().ok(),
        }
    }

    fn sample(&mut self) -> Option<GpuSnapshot> {
        let query = self.inner.as_mut()?;
        query.sample().map(|usage_percent| GpuSnapshot {
            usage_percent: clamp_percent(usage_percent),
        })
    }
}

#[cfg(target_os = "windows")]
struct GpuPdhQuery {
    query: windows_sys::Win32::System::Performance::PDH_HQUERY,
    counter: windows_sys::Win32::System::Performance::PDH_HCOUNTER,
}

// PDH handles are only accessed through ResourceCollector's global Mutex.
#[cfg(target_os = "windows")]
unsafe impl Send for GpuPdhQuery {}

#[cfg(target_os = "windows")]
impl GpuPdhQuery {
    fn new() -> Result<Self, ()> {
        use windows_sys::Win32::System::Performance::{
            PdhAddEnglishCounterW, PdhCollectQueryData, PdhOpenQueryW, PDH_HCOUNTER, PDH_HQUERY,
        };

        let mut query: PDH_HQUERY = std::ptr::null_mut();
        let mut counter: PDH_HCOUNTER = std::ptr::null_mut();
        let counter_path = wide_null(r"\GPU Engine(*)\Utilization Percentage");

        unsafe {
            if PdhOpenQueryW(std::ptr::null(), 0, &mut query) != 0 {
                return Err(());
            }
            if PdhAddEnglishCounterW(query, counter_path.as_ptr(), 0, &mut counter) != 0 {
                let _ = windows_sys::Win32::System::Performance::PdhCloseQuery(query);
                return Err(());
            }
            let _ = PdhCollectQueryData(query);
        }

        Ok(Self { query, counter })
    }

    fn sample(&mut self) -> Option<f32> {
        use windows_sys::Win32::System::Performance::{
            PdhCollectQueryData, PdhGetFormattedCounterArrayW, PDH_FMT_COUNTERVALUE_ITEM_W,
            PDH_FMT_DOUBLE, PDH_MORE_DATA,
        };

        unsafe {
            if PdhCollectQueryData(self.query) != 0 {
                return None;
            }

            let mut buffer_size = 0_u32;
            let mut item_count = 0_u32;
            let status = PdhGetFormattedCounterArrayW(
                self.counter,
                PDH_FMT_DOUBLE,
                &mut buffer_size,
                &mut item_count,
                std::ptr::null_mut(),
            );
            if status != PDH_MORE_DATA || buffer_size == 0 || item_count == 0 {
                return None;
            }

            let mut buffer = vec![0_u8; buffer_size as usize];
            let items = buffer.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;
            if PdhGetFormattedCounterArrayW(
                self.counter,
                PDH_FMT_DOUBLE,
                &mut buffer_size,
                &mut item_count,
                items,
            ) != 0
            {
                return None;
            }

            let values = std::slice::from_raw_parts(items, item_count as usize);
            let usage = values
                .iter()
                .filter(|item| item.FmtValue.CStatus == 0)
                .map(|item| item.FmtValue.Anonymous.doubleValue.max(0.0))
                .sum::<f64>();
            Some(usage as f32)
        }
    }
}

#[cfg(target_os = "windows")]
impl Drop for GpuPdhQuery {
    fn drop(&mut self) {
        unsafe {
            let _ = windows_sys::Win32::System::Performance::PdhCloseQuery(self.query);
        }
    }
}

#[cfg(target_os = "windows")]
fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bytes_per_second_uses_elapsed_time() {
        assert_eq!(bytes_per_second(2_000, 2.0), 1_000);
    }

    #[test]
    fn clamp_percent_bounds_values() {
        assert_eq!(clamp_percent(-1.0), 0.0);
        assert_eq!(clamp_percent(120.0), 100.0);
        assert_eq!(clamp_percent(f32::NAN), 0.0);
    }

    #[test]
    fn network_daily_totals_use_day_baseline_and_reset_on_counter_drop() {
        let day = NaiveDate::from_ymd_opt(2026, 7, 9).unwrap();
        let mut baseline = None;

        assert_eq!(network_daily_totals(&mut baseline, day, 100, 200), (0, 0));
        assert_eq!(network_daily_totals(&mut baseline, day, 150, 260), (50, 60));
        assert_eq!(network_daily_totals(&mut baseline, day, 90, 300), (0, 0));
        assert_eq!(
            network_daily_totals(
                &mut baseline,
                NaiveDate::from_ymd_opt(2026, 7, 10).unwrap(),
                120,
                330
            ),
            (0, 0)
        );
    }

    #[test]
    fn sampling_options_keep_legacy_full_detail_behavior() {
        let options = SamplingOptions::from_args(Some(false), None);
        assert!(options.system);
        assert!(options.cpu);
        assert!(options.memory);
        assert!(!options.network);
        assert!(!options.disk);
        assert!(!options.gpu);
        assert!(!options.processes);
    }

    #[test]
    fn should_refresh_respects_expensive_interval() {
        let now = Instant::now();
        assert!(should_refresh(None, now));
        assert!(!should_refresh(Some(now), now));
        assert!(should_refresh(
            Some(now - EXPENSIVE_REFRESH_INTERVAL - Duration::from_secs(1)),
            now
        ));
    }
}
