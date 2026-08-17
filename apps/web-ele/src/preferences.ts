import { defineOverridesPreferences } from '@vben/preferences';

export const overridesPreferences = defineOverridesPreferences({
  app: {
    accessMode: 'frontend',
    compact: true,
    contentCompact: 'wide',
    // 内网部署：避免默认头像走 unpkg
    defaultAvatar: '/logo-saa.png',
    enableCheckUpdates: false,
    enablePreferences: true,
    locale: 'zh-CN',
    name: import.meta.env.VITE_APP_TITLE,
  },
  breadcrumb: {
    enable: true,
    hideOnlyOne: false,
    showHome: false,
    showIcon: true,
  },
  copyright: {
    companyName: 'Symtek Automation China',
    companySiteLink: '',
    date: '2026',
    enable: false,
    icp: '',
    icpLink: '',
  },
  footer: { enable: false },
  logo: {
    enable: true,
    source: '/logo-saa.png',
  },
  navigation: {
    accordion: true,
    split: false,
    styleType: 'rounded',
  },
  shortcutKeys: {
    enable: false,
    globalLockScreen: false,
    globalLogout: false,
    globalPreferences: false,
    globalSearch: false,
  },
  sidebar: {
    collapsed: false,
    collapsedShowTitle: false,
    expandOnHover: false,
    width: 228,
  },
  tabbar: {
    enable: false,
    keepAlive: false,
    persist: false,
  },
  theme: {
    builtinType: 'default',
    colorPrimary: 'hsl(212 78% 46%)',
    mode: 'light',
    radius: '0.375',
    semiDarkHeader: false,
    semiDarkSidebar: false,
  },
  transition: {
    enable: true,
    loading: true,
    name: 'fade',
    progress: true,
  },
  widget: {
    fullscreen: false,
    globalSearch: false,
    languageToggle: false,
    lockScreen: false,
    notification: false,
    refresh: true,
    sidebarToggle: true,
    themeToggle: true,
  },
});
