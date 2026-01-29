# no-use-after-free.js

👉 **[`npm i @sirpepe/no-use-after-free`](https://www.npmjs.com/package/@sirpepe/no-use-after-free)**

[JavaScript's Explicit Resource Management API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Resource_management) does not by itself prevent use-after-free:

```javascript
// Class representing some sort of resource
class Example {
  doSomething() {
    console.log("Doing something");
  }
  // Logic to clean up the resource
  [Symbol.dispose]() {
    console.log("Cleaning up");
  }
}

function test() {
  using resource = new Example(); // "using" ensures Symbol.dispose runs at the end of the function
  resource.doSomething(); // logs "Doing something"
  return resource; // returns/leaks the resource that gets cleaned up at the end of the function
  // Symbol.dispose runs here, logs "Cleaning up"
}

let instance = test();
instance.doSomething(); // STILL logs "Doing something" ⚠️
```

`no-use-after-free.js` prevents use-after-free with Explicit Resource Management at run-time. Every interaction with an object that has had its `Symbol.dispose` or `Symbol.asyncDispose` run to completion results in exceptions.

```javascript
class Example {
  doSomething() {
    console.log("Doing something");
  }
  [Symbol.dispose]() {
    console.log("Cleaning up");
  }
}

import noUseAfterFree from "@sirpepe/no-use-after-free";

function test() {
  using resource = noUseAfterFree(new Example()); // add cleanup tracking
  resource.doSomething(); // works
  return resource;
  // Symbol.dispose runs here, logs "Cleaning up"
}

let instance = test();
instance.doSomething(); // Throws an exception ✅
```

To further automate this, you can add the cleanup tracking directly in your object's factory functions or class constructors:

```javascript
import noUseAfterFree from "@sirpepe/no-use-after-free";

class Example {
  constructor() {
    return noUseAfterFree(this); // yes this works. Yes, even with TypeScript
  }
  doSomething() {
    console.log("Doing something");
  }
  [Symbol.dispose]() {
    console.log("Cleaning up");
  }
}
```

The main function also works as a [class decorator](https://github.com/tc39/proposal-decorators):

```javascript
import noUseAfterFree from "@sirpepe/no-use-after-free";

@noUseAfterFree
class Example {
  doSomething() {
    console.log("Doing something");
  }
  [Symbol.dispose]() {
    console.log("Cleaning up");
  }
}

function test() {
  using resource = new Example();
  resource.doSomething(); // works
  return resource;
  // Symbol.dispose runs here, logs "Cleaning up"
}

let instance = test();
resource.doSomething(); // fails
```

To get the decorator syntax working in early 2026, you will probably need _some_ tooling support, such as:

- [@babel/plugin-proposal-decorators](https://babeljs.io/docs/babel-plugin-proposal-decorators)
  (with the option `version` set to `"2023-11"`)
- [esbuild](https://esbuild.github.io) (with the option `target` set to something other than `esnext`)
- [TypeScript 5.0+](https://devblogs.microsoft.com/typescript/announcing-typescript-5-0/#decorators)
  (with the option `experimentalDecorators` turned _off_).

## How does this work?

This library works by wrapping disposable objects in revocable proxies that render the objects unusable once either `Symbol.dispose` or `Symbol.asyncDispose` have run to completion. Despite the wrapper, private class fields and private methods should keep working out of the box - the proxy redirects `this` values appropriately

## Edge cases

> [!IMPORTANT]
> Everything in the section this only applies when you **don't** use the class decorator syntax!

An edge case that does _not_ work without manual intervention is static methods accessing private fields on instances of non-decorated classes:

```javascript
import noUseAfterFree from "@sirpepe/no-use-after-free";

class Example {
  #x = 1;

  static readX(instance) {
    return instance.#x;
  }

  [Symbol.dispose]() {
    console.log("Cleaning up");
  }
}

using instance1 = new Example();
Example.readX(instance1); // OK

using instance2 = noUseAfterFree(new Example());
Example.readX(instance3); // Error
```

This fails because the object that gets passed to the static method is an instance wrapped in the tracking proxy - and the proxy, not being an actual instance of the class, is not allowed to access private members. To work around this, the proxies can be unwrapped with `noUseAfterFree.unwrap()`:

```javascript
import noUseAfterFree from "@sirpepe/no-use-after-free";

class Example {
  #x = 1;

  static readX(instance) {
    return instance.#x;
  }

  [Symbol.dispose]() {
    console.log("Cleaning up");
  }
}

using instance1 = new Example();
Example.readX(instance1); // OK

using instance2 = noUseAfterFree(new Example());
Example.readX(noUseAfterFree.unwrap(instance3)); // OK
```

When in doubt, just add `noUseAfterFree.unwrap()`. Objects that are not proxies created by `noUseAfterFree` are returned as-is.

The way to think about this is that the party responsible for creating the wrapper proxy is also responsible for unwrapping. If the wrapper is added in a class constructor or factory function, static methods or associated helper functions should implement unwrapping. `noUseAfterFree.unwrap()` throws an exception when called with a proxy for an already disposed-of target. This turns the developer experience for users of instanced into a no-brainer:

```javascript
class Example {
  #x = 1;

  // Auto-installs noUseAfterFree on instantiation
  constructor() {
    return noUseAfterFree(this);
  }

  // Manually unwraps to be able to access #x
  // Throws if the object has already been disposed of
  static readX(instance) {
    return noUseAfterFree.unwrap(instance).#x;
  }

  [Symbol.dispose]() {
    /* ... */
  }
}

const instance = (function () {
  using instance = new Example();
  console.log(Example.readX(instance)); // works, logs 1
  return instance;
})();

// Fails: object has already been disposed of
console.log(Example.readX(instance));
```

Remember: if you use the a class decorator syntax, the above edge case does not apply. When used as a decorator, the main function _wraps the entire class_ into a proxy that turns instances into proxies and auto-unwraps proxies in arguments to static methods.
