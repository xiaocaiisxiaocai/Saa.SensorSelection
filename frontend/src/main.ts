import { createApp } from 'vue';
import { createPinia } from 'pinia';
import Antd, { ConfigProvider } from 'ant-design-vue';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import 'ant-design-vue/dist/reset.css';

import App from './App.vue';
import { router } from './router';

import './styles/global.css';

document.documentElement.removeAttribute('data-theme');
try {
  localStorage.removeItem('apple-frontend:theme');
} catch {
  /* private browsing */
}

dayjs.locale('zh-cn');

// Modal.confirm 等静态 API 渲染在应用树之外，拿不到 App.vue 里
// <a-config-provider> 的设置，按钮会变成「取 消」「删 除」。
// 这里给静态 API 的全局配置也关掉两字中文按钮自动插空格。
// （config() 运行时会把任意字段并入静态 API 的 ConfigProvider，
// 但类型声明只列了 prefixCls/theme，所以需要断言。）
ConfigProvider.config({ autoInsertSpaceInButton: false } as Parameters<
  typeof ConfigProvider.config
>[0]);

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(Antd);
app.mount('#app');
