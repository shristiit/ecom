import { Router } from 'express';

type AnyFn = (...args: any[]) => any;
type RouterWithHandle = AnyFn & { handle?: AnyFn };

let patched = false;

function shouldWrap(arg: unknown): arg is AnyFn {
  if (typeof arg !== 'function') return false;
  const fn = arg as RouterWithHandle;
  // Skip Express routers/sub-apps and error handlers.
  if (typeof fn.handle === 'function') return false;
  if (fn.length === 4) return false;
  return true;
}

function wrapHandler(fn: AnyFn): AnyFn {
  return function wrappedAsyncHandler(this: unknown, ...args: any[]) {
    const next = args[2];
    try {
      const result = fn.apply(this, args);
      if (result && typeof result.then === 'function') {
        result.catch(next);
      }
      return result;
    } catch (error) {
      return next(error);
    }
  };
}

function enableAsyncErrors() {
  if (patched) return;
  patched = true;

  const methods = ['use', 'all', 'get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;
  for (const method of methods) {
    const original = (Router as any).prototype[method] as AnyFn;
    (Router as any).prototype[method] = function patchedRouterMethod(...args: any[]) {
      const wrappedArgs = args.map((arg) => (shouldWrap(arg) ? wrapHandler(arg) : arg));
      return original.apply(this, wrappedArgs);
    };
  }
}

enableAsyncErrors();
