import { test, suite, mock } from "node:test";
import assert from "node:assert";
import noUseAfterFree from "../src/index.ts";

suite(`Sync`, () => {
  test("prevent use after free", () => {
    const spy = mock.fn();
    class Example {
      x = 1;
      [Symbol.dispose]() {
        spy();
      }
    }
    const instance = (function () {
      using instance = noUseAfterFree(new Example());
      assert.equal(instance.x, 1);
      return instance;
    })();
    assert.equal(spy.mock.callCount(), 1);
    assert.throws(() => instance.x);
  });

  test("deal with multiple applications of useAfterFree", () => {
    const spy = mock.fn();
    class Example {
      x = 1;
      [Symbol.dispose]() {
        spy();
      }
    }
    const instance = (function () {
      using instance = noUseAfterFree(noUseAfterFree(new Example()));
      assert.equal(instance.x, 1);
      return instance;
    })();
    assert.equal(spy.mock.callCount(), 1);
    assert.throws(() => instance.x);
  });

  test("works with non-disposable inputs", () => {
    class Example {
      x = 1;
    }
    const instance = (function () {
      const instance = noUseAfterFree(new Example() as any);
      assert.equal(instance.x, 1);
      return instance;
    })();
    assert.equal(instance.x, 1);
  });

  test("private fields keep working despite the proxy", () => {
    class Example {
      #x = 1;
      get x() {
        return this.#x;
      }
      set x(value: number) {
        this.#x = value;
      }
      readX1() {
        return this.#x;
      }
      readX2 = () => {
        return this.#x;
      };
      [Symbol.dispose]() {}
    }
    const instance = (function () {
      using instance = noUseAfterFree(new Example());
      instance.x = 2;
      assert.equal(instance.x, 2);
      assert.equal(instance.readX1(), 2);
      assert.equal(instance.readX2(), 2);
      return instance;
    })();
    assert.throws(() => instance.x);
  });

  test("private fields keep working inside disposal logic", () => {
    const spy = mock.fn();
    class Example {
      #x = 1;
      get x() {
        return this.#x;
      }
      [Symbol.dispose]() {
        spy(this.#x);
      }
    }
    const instance = (function () {
      using instance = noUseAfterFree(new Example());
      return instance;
    })();
    assert.throws(() => instance.x);
    assert.equal(spy.mock.callCount(), 1);
  });

  test("'this' shenanigans remain possible", () => {
    class Example {
      #x: number;
      constructor(value: number) {
        this.#x = value;
      }
      readX() {
        return this.#x;
      }
      [Symbol.dispose]() {}
    }
    const a = noUseAfterFree(new Example(1));
    const b = noUseAfterFree(new Example(2));
    assert.equal(a.readX.call(b), 2);
  });

  test("unwrap()", () => {
    class Example {
      #x = 1;
      static readX(instance: Example) {
        return instance.#x;
      }
      [Symbol.dispose]() {}
    }
    const instance = (function () {
      using instance = noUseAfterFree(new Example());
      // Fails: proxy can't access #x
      assert.throws(() => Example.readX(instance));
      // Works: proxy's content can access #x
      assert.equal(Example.readX(noUseAfterFree.unwrap(instance)), 1);
      return instance;
    })();
    // Fails: proxy has been revoked
    assert.throws(() => noUseAfterFree.unwrap(instance));
  });

  test("unwrap() deals with multiple applications of useAfterFree", () => {
    class Example {
      #x = 1;
      static readX(instance: Example) {
        return instance.#x;
      }
      [Symbol.dispose]() {}
    }
    const instance = (function () {
      using instance = noUseAfterFree(noUseAfterFree(new Example()));
      // Fails: proxy can't access #x
      assert.throws(() => Example.readX(instance));
      // Works: proxy's content can access #x
      assert.equal(Example.readX(noUseAfterFree.unwrap(instance)), 1);
      return instance;
    })();
    // Fails: proxy has been revoked
    assert.throws(() => noUseAfterFree.unwrap(instance));
  });

  test("self-contained implementation", () => {
    class Example {
      #x = 1;
      constructor() {
        return noUseAfterFree(this);
      }
      static readX(instance: Example) {
        return noUseAfterFree.unwrap(instance).#x;
      }
      [Symbol.dispose]() {}
    }
    const instance = (function () {
      using instance = new Example();
      assert.equal(Example.readX(instance), 1);
      return instance;
    })();
    // Fails: proxy has been revoked
    assert.throws(() => Example.readX(instance));
  });
});

suite(`Async`, () => {
  test("prevent use after free", () => {
    const spy = mock.fn();
    class Example {
      x = 1;
      async [Symbol.asyncDispose]() {
        spy();
      }
    }
    assert.rejects(async () => {
      await (async function () {
        await using instance = noUseAfterFree(new Example());
        assert.equal(instance.x, 1);
        return instance;
      })();
    });
    assert.equal(spy.mock.callCount(), 1);
  });

  test("works with non-disposable inputs", async () => {
    class Example {
      x = 1;
    }
    const instance = await (async function () {
      const instance = noUseAfterFree(new Example() as any);
      assert.equal(instance.x, 1);
      return instance;
    })();
    assert.equal(instance.x, 1);
  });

  test("private fields keep working despite the proxy", () => {
    class Example {
      #x = 1;
      get x() {
        return this.#x;
      }
      set x(value: number) {
        this.#x = value;
      }
      readX1() {
        return this.#x;
      }
      readX2 = () => {
        return this.#x;
      };
      async [Symbol.asyncDispose]() {}
    }
    assert.rejects(async () => {
      await (async function () {
        await using instance = noUseAfterFree(new Example());
        instance.x = 2;
        assert.equal(instance.x, 2);
        assert.equal(instance.readX1(), 2);
        assert.equal(instance.readX2(), 2);
        return instance;
      })();
    });
  });

  test("private fields keep working inside disposal logic", async () => {
    const spy = mock.fn();
    class Example {
      #x = 1;
      get x() {
        return this.#x;
      }
      async [Symbol.asyncDispose]() {
        spy(this.#x);
      }
    }
    await (async function () {
      // eslint-disable-next-line
      await using instance = noUseAfterFree(new Example());
    })();
    assert.equal(spy.mock.callCount(), 1);
  });

  test("unwrap()", async () => {
    class Example {
      #x = 1;
      static readX(instance: Example) {
        return instance.#x;
      }
      async [Symbol.asyncDispose]() {}
    }
    assert.rejects(
      (async function () {
        await using instance = noUseAfterFree(new Example());
        // Fails: proxy can't access #x
        assert.throws(() => Example.readX(instance));
        // Works: proxy's content can access #x
        assert.equal(Example.readX(noUseAfterFree.unwrap(instance)), 1);
        // Disposing manually for the sake of testing
        await instance[Symbol.asyncDispose]();
        // Fails: proxy has been revoked
        assert.throws(() => noUseAfterFree.unwrap(instance));
      })(),
    );
  });
});

suite(`Decorators`, () => {
  test("Decorated classes construct instances with dispose tracking, static methods auto-unwrap", () => {
    @noUseAfterFree
    class Example {
      #x = 1;
      get x() {
        return this.#x;
      }
      static readX(instance: Example) {
        return instance.#x;
      }
      [Symbol.dispose]() {}
    }
    const instance = (function () {
      using instance = new Example();
      assert.equal(instance.x, 1);
      assert.equal(Example.readX(instance), 1);
      return instance;
    })();
    // The below all fail: proxy has been revoked
    assert.throws(() => instance.x);
    assert.throws(() => Example.readX(instance));
    assert.throws(() => noUseAfterFree.unwrap(instance));
  });

  test("Decorated subclassing", () => {
    class Base {
      [Symbol.dispose]() {}
    }
    @noUseAfterFree
    class Example extends Base {
      #x = 1;
      get x() {
        return this.#x;
      }
      static readX(instance: Example) {
        return instance.#x;
      }
    }
    const instance = (function () {
      using instance = new Example();
      assert.equal(instance.x, 1);
      assert.equal(Example.readX(instance), 1);
      return instance;
    })();
    // The below all fail: proxy has been revoked
    assert.throws(() => instance.x);
    assert.throws(() => Example.readX(instance));
    assert.throws(() => noUseAfterFree.unwrap(instance));
  });

  test("Decorated subclassing with the decorator applied twice", () => {
    @noUseAfterFree
    class Base {
      [Symbol.dispose]() {}
    }
    @noUseAfterFree
    class Example extends Base {
      #x = 1;
      get x() {
        return this.#x;
      }
      static readX(instance: Example) {
        return instance.#x;
      }
    }
    const instance = (function () {
      using instance = new Example();
      assert.equal(instance.x, 1);
      assert.equal(Example.readX(instance), 1);
      return instance;
    })();
    // The below all fail: proxy has been revoked
    assert.throws(() => instance.x);
    assert.throws(() => Example.readX(instance));
    assert.throws(() => noUseAfterFree.unwrap(instance));
  });

  test("Decorated subclassing of subclasses", () => {
    class Base {
      [Symbol.dispose]() {}
    }
    class Something extends Base {}
    @noUseAfterFree
    class Example extends Something {
      #x = 1;
      get x() {
        return this.#x;
      }
      static readX(instance: Example) {
        return instance.#x;
      }
    }
    const instance = (function () {
      using instance = new Example();
      assert.equal(instance.x, 1);
      assert.equal(Example.readX(instance), 1);
      return instance;
    })();
    // The below all fail: proxy has been revoked
    assert.throws(() => instance.x);
    assert.throws(() => Example.readX(instance));
    assert.throws(() => noUseAfterFree.unwrap(instance));
  });

  test("Cursed readme example", () => {
    // Note that the decorator, because it only gets applied to the base class,
    // can't do anything to subclasses. It does wrap "this" in a proxy but can't
    // touch subclasses static methods.
    @noUseAfterFree
    class Base {
      [Symbol.dispose]() {}
    }

    class Example extends Base {
      // This adds an actual property on the instance. This means that this
      // property can't be accessed once the proxy is revoked after
      // Symbol.dispose() has run to completion.
      notSecret = 42;

      // This does actually NOT add a property on the instance, but works more
      // like special of variable that's only valid inside the "scope" defined
      // by the Example class
      #secret = 23;

      static readSecret(instance: Example) {
        return instance.#secret;
      }

      static readNotSecret(instance: Example) {
        return instance.notSecret;
      }
    }
    // "instance" is immediately revoked once it gets returned from the IIFE
    const instance = (function () {
      using ex = new Example();
      assert.equal(Example.readSecret(ex), 23); // works as expected
      assert.equal(Example.readNotSecret(ex), 42); // works as expected
      return ex;
    })();
    // Fails; instance has been revoked
    assert.throws(() => instance.notSecret);
    // Fails; instance has been revoked
    assert.throws(() => Example.readNotSecret(instance));
    // !!! DOES NOT FAIL !!! Reading the private field does not involve an
    // actual property read from "instance", so it can't be prevented by the
    // library.
    assert.throws(() => {
      assert.throws(() => Example.readSecret(instance)); // assertion error
    });
  });
});
