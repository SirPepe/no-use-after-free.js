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

  test("unwrap()", () => {
    class Example {
      #x = 1;
      static readX(instance: Example) {
        return instance.#x;
      }
      async [Symbol.asyncDispose]() {}
    }
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
    })();
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
});
