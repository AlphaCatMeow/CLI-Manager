use serde::Serialize;

/// 应用版本信息
#[derive(Serialize)]
pub struct AppVersion {
    pub version: String,
    pub name: String,
    pub distribution: String,
}

fn resolve_distribution(value: Option<&str>) -> &'static str {
    match value {
        Some(value) if value.eq_ignore_ascii_case("aur") => "aur",
        _ => "standalone",
    }
}

/// 获取应用版本号
#[tauri::command]
pub fn get_app_version(app: tauri::AppHandle) -> AppVersion {
    let config = app.config();
    AppVersion {
        version: config
            .version
            .clone()
            .unwrap_or_else(|| "unknown".to_string()),
        name: config
            .product_name
            .clone()
            .unwrap_or_else(|| "CLI-Manager".to_string()),
        distribution: resolve_distribution(
            std::env::var("CLI_MANAGER_DISTRIBUTION").ok().as_deref(),
        )
        .to_string(),
    }
}

/// 获取当前操作系统平台（"windows" / "macos" / "linux" / "unknown"）
#[tauri::command]
pub fn get_os_platform() -> String {
    #[cfg(target_os = "windows")]
    {
        "windows".to_string()
    }
    #[cfg(target_os = "macos")]
    {
        "macos".to_string()
    }
    #[cfg(target_os = "linux")]
    {
        "linux".to_string()
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        "unknown".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::resolve_distribution;

    #[test]
    fn recognizes_aur_distribution_case_insensitively() {
        assert_eq!(resolve_distribution(Some("aur")), "aur");
        assert_eq!(resolve_distribution(Some("AUR")), "aur");
        assert_eq!(resolve_distribution(None), "standalone");
        assert_eq!(resolve_distribution(Some("unknown")), "standalone");
    }
}
