const proxies = new WeakMap<any, any>();
const revoked = new WeakSet<any>();

// Returns a proxy that is revoked once disposal logic has run to completion
function trackUseAfterFree<T extends Disposable | AsyncDisposable>(
  base: T,
  unwrapReceivers: boolean,
  allowWrapping: boolean,
): T {
  if (!allowWrapping && proxies.has(base)) {
    console.log("yep");
    return base;
  }

  const { proxy, revoke } = Proxy.revocable(base, {
    get(target, key, receiver) {
      const value = Reflect.get(
        target,
        key,
        unwrapReceivers ? unwrap(receiver) : receiver,
      );
      // Sync
      if (key === Symbol.dispose && typeof value === "function") {
        return function (this: T): void {
          const result = value.call(unwrap(this));
          revoke();
          revoked.add(proxy);
          return result;
        };
      }

      // Async
      if (key === Symbol.asyncDispose && typeof value === "function") {
        return async function (this: T): Promise<void> {
          const result = await value.call(unwrap(this));
          revoke();
          revoked.add(proxy);
          return result;
        };
      }

      // Re-target method's this from the proxy to the target to keep private
      // fields working
      if (typeof value === "function") {
        return function (this: T, ...args: unknown[]): unknown {
          return value.apply(unwrap(this), args);
        };
      }

      return value;
    },

    // Non-default set trap uses target as the receiver to keep private fields
    // working
    set(target, key, newValue, receiver) {
      return Reflect.set(
        target,
        key,
        newValue,
        unwrapReceivers ? unwrap(receiver) : receiver,
      );
    },
  });
  proxies.set(proxy, base);
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

  const classProxy: T = new Proxy(target, {
    construct(target, args, newTarget) {
      const inheritsFromDecorated = newTarget !== classProxy;
      return trackUseAfterFree(
        Reflect.construct(target, args, newTarget),
        !inheritsFromDecorated,
        true,
      );
    },
    get(target, key, receiver) {
      const value = Reflect.get(target, key, unwrap(receiver));
      if (typeof value === "function") {
        return function (this: T, ...inputArgs: unknown[]): unknown {
          return value.apply(unwrap(this), inputArgs.map(unwrap));
        };
      }
      return value;
    },
  });
  return classProxy;
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
    return trackUseAfterFree(target, true, false);
  }
}

noUseAfterFree.unwrap = unwrap;
