import { MantineProvider, colorsTuple, createTheme } from "@mantine/core";
import { useMemo, type ReactNode } from "react";
import {
  useSettingsStore,
  type DarkThemePalette,
  type LightThemePalette,
} from "../../stores/settingsStore";

const LIGHT_PRIMARY_COLORS: Record<LightThemePalette, string> = {
  "warm-paper": "#c46a2d",
  "cream-green": "#3f7a4f",
  "ink-red": "#c43d2f",
  "saas-analytics-dashboard": "#3b82f6",
  "apple-pure": "#007aff",
  "apple-mist": "#0a84ff",
  "apple-warm": "#ff9f0a",
  "apple-mono": "#3a3a3c",
};

const DARK_PRIMARY_COLORS: Record<DarkThemePalette, string> = {
  "night-indigo": "#7aa2f7",
  "forest-night": "#52a36e",
  "graphite-red": "#c95b4a",
  "investment-platform": "#f59e0b",
  "github-dark": "#58a6ff",
  "catppuccin-mocha": "#89b4fa",
  "nord-night": "#88c0d0",
  "dracula-purple": "#bd93f9",
  "carbon-black": "#78a9ff",
};

interface AppMantineThemeProviderProps {
  children: ReactNode;
}

export function AppMantineThemeProvider({ children }: AppMantineThemeProviderProps) {
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const lightThemePalette = useSettingsStore((s) => s.lightThemePalette);
  const darkThemePalette = useSettingsStore((s) => s.darkThemePalette);
  const uiFontFamily = useSettingsStore((s) => s.uiFontFamily);
  const primaryColor =
    resolvedTheme === "dark" ? DARK_PRIMARY_COLORS[darkThemePalette] : LIGHT_PRIMARY_COLORS[lightThemePalette];

  const mantineTheme = useMemo(
    () =>
      createTheme({
        colors: {
          cliPrimary: colorsTuple(primaryColor),
        },
        primaryColor: "cliPrimary",
        fontFamily: uiFontFamily,
        fontFamilyMonospace: uiFontFamily,
        headings: {
          fontFamily: uiFontFamily,
        },
        defaultRadius: "md",
      }),
    [primaryColor, uiFontFamily]
  );

  return (
    <MantineProvider theme={mantineTheme} defaultColorScheme={resolvedTheme} forceColorScheme={resolvedTheme}>
      {children}
    </MantineProvider>
  );
}
