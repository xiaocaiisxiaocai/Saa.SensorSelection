function ensureMapHelpers() {
  const proto = Map.prototype as {
    getOrInsert?: (key: unknown, defaultValue: unknown) => unknown;
    getOrInsertComputed?: (
      key: unknown,
      callbackFn: (key: unknown) => unknown,
    ) => unknown;
  } & Map<unknown, unknown>;

  if (typeof proto.getOrInsert !== 'function') {
    Object.defineProperty(proto, 'getOrInsert', {
      configurable: true,
      value(key: unknown, defaultValue: unknown) {
        if (this.has(key)) return this.get(key);
        this.set(key, defaultValue);
        return defaultValue;
      },
      writable: true,
    });
  }

  if (typeof proto.getOrInsertComputed !== 'function') {
    Object.defineProperty(proto, 'getOrInsertComputed', {
      configurable: true,
      value(key: unknown, callbackFn: (key: unknown) => unknown) {
        if (this.has(key)) return this.get(key);
        const value = callbackFn(key);
        this.set(key, value);
        return value;
      },
      writable: true,
    });
  }
}

ensureMapHelpers();
