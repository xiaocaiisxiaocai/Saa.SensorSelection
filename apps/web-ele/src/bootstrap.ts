import { createApp, watchEffect } from 'vue';

import { registerAccessDirective } from '@vben/access';
import { preferences } from '@vben/preferences';
import { initStores } from '@vben/stores';
import '@vben/styles';
import '@vben/styles/ele';

import { useTitle } from '@vueuse/core';

import { initComponentAdapter } from './adapter/component';
import App from './app.vue';
import { setupI18n } from './locales';
import { router } from './router';

import './modules/selection/selection.css';

async function bootstrap(namespace: string) {
  await initComponentAdapter();

  const app = createApp(App);
  await setupI18n(app);
  await initStores(app, { namespace });
  registerAccessDirective(app);
  app.use(router);

  watchEffect(() => {
    if (!preferences.app.dynamicTitle) return;
    const routeTitle = router.currentRoute.value.meta?.title;
    useTitle(
      routeTitle
        ? `${String(routeTitle)} - ${preferences.app.name}`
        : preferences.app.name,
    );
  });

  app.mount('#app');
}

export { bootstrap };
