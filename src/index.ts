const proxies = new WeakMap<any, any>();
const revoked = new WeakSet<any>();

// Returns a proxy that is revoked once disposal logic has run to completion
function trackUseAfterFree<T extends Disposable | AsyncDisposable>(
  target: T,
): T {
  const { proxy, revoke } = Proxy.revocable(target, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, target);
      // Sync
      if (key === Symbol.dispose && typeof value === "function") {
        return function (this: T): void {
          const result = value.call(this);
          revoke();
          revoked.add(proxy);
          return result;
        };
      }

      // Async
      if (key === Symbol.asyncDispose && typeof value === "function") {
        return async function (this: T): Promise<void> {
          const result = await value.call(this);
          revoke();
          revoked.add(proxy);
          return result;
        };
      }

      // Re-target method's this from the proxy to the target to keep private
      // fields working
      if (typeof value === "function") {
        return function (this: T, ...args: unknown[]): unknown {
          const that = this === receiver ? target : this;
          return value.apply(that, args);
        };
      }

      return value;
    },

    // Non-default set trap uses target as the receiver to keep private fields
    // working
    set(target, key, newValue) {
      return Reflect.set(target, key, newValue, target);
    },
  });
  proxies.set(proxy, target);
  return proxy;
}

function unwrap<T>(input: T): T {
  if (revoked.has(input)) {
    throw new Error("Object has already been disposed");
  }
  return proxies.get(input) ?? input;
}

function decorator<T extends new (...args: unknown[]) => Disposable>(
  target: T,
  context: ClassDecoratorContext<T>,
): T;
function decorator<T extends new (...args: unknown[]) => AsyncDisposable>(
  target: T,
  context: ClassDecoratorContext<T>,
): T;
function decorator<T extends new (...args: unknown[]) => unknown>(
  target: T,
  context: ClassDecoratorContext<T>,
): T {
  if (context.kind !== "class") {
    throw new Error("Class decorator applied to " + context.kind);
  }
  return new Proxy(target, {
    construct(target, args, newTarget) {
      return trackUseAfterFree(Reflect.construct(target, args, newTarget));
    },
    get(target, key, receiver) {
      const value = Reflect.get(target, key, target);
      if (typeof value === "function") {
        return function (this: T, ...inputArgs: unknown[]): unknown {
          const that = this === receiver ? target : this;
          const unwrappedArgs = inputArgs.map(unwrap);
          return value.apply(that, unwrappedArgs);
        };
      }
      return value;
    },
  });
}

export default function noUseAfterFree<
  T extends new (...args: unknown[]) => Disposable,
>(target: T, context: ClassDecoratorContext<T>): T;
export default function noUseAfterFree<
  T extends new (...args: unknown[]) => AsyncDisposable,
>(target: T, context: ClassDecoratorContext<T>): T;
export default function noUseAfterFree<
  T extends new (...args: unknown[]) => unknown,
>(target: T, context: ClassDecoratorContext<T>): T;
export default function noUseAfterFree<T extends Disposable | AsyncDisposable>(
  target: T,
): T;
export default function noUseAfterFree<T>(target: any, context?: any): T {
  if (context) {
    return decorator(target, context);
  } else {
    return trackUseAfterFree(target);
  }
}

noUseAfterFree.unwrap = unwrap;
