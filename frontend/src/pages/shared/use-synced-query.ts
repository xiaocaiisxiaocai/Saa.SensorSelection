import { watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

export function useSyncedQuery(
  build: () => Record<string, string | undefined>,
) {
  const route = useRoute();
  const router = useRouter();

  watch(
    build,
    (next) => {
      const query: Record<string, string> = {};
      for (const [key, value] of Object.entries(next)) {
        if (value) query[key] = value;
      }
      const current: Record<string, string> = {};
      for (const [key, value] of Object.entries(route.query)) {
        if (typeof value === 'string' && value) current[key] = value;
      }
      const keys = new Set([...Object.keys(query), ...Object.keys(current)]);
      let same = true;
      for (const key of keys) {
        if (query[key] !== current[key]) {
          same = false;
          break;
        }
      }
      if (!same) {
        void router.replace({ path: route.path, query });
      }
    },
    { deep: true },
  );
}
