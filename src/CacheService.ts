import { Observable, Subject, of, tap, throwError, catchError, defer } from 'rxjs';

/**
 * 因为普通的内存cache，没有遍历逻辑，
 * 所以由读取者决定是否要缓存中的值，（不需要强制更新逻辑）
 * * 如果需要快速更新的，则lifetime设置短，
 * * 如果需要长时间储存的，则lifetime设置长
 */
interface CacheContent {
  timestamp: number;
  value: any;
}

const DEFAULT_LIFE_TIME = 300000; // 5 mins

export interface CacheServiceStorage {
  delete(key: string): boolean;
  get(key: string): CacheContent | undefined;
  has(key: string): boolean;
  set(key: string, value: CacheContent): this;
}

/**
 * Cache Service is an observables based in-memory cache implementation
 * Keeps track of in-flight observables and sets a default expiry for cached values
 * 
 * ### 使用原则
 * * 不同模块使用时，尽量定义自己的cache key
 * * key值尽量不要随请求参数变化
 * * Error也会被派发给inFlight的所有observables
 * * 在等待request返回期间，相同的请求不会重复发送
 * * get的fallback延迟执行
 * 
 * @export
 * @class CacheService
 */
export class CacheService {
  private readonly inFlightObservables: Map<string, Subject<any>> = new Map<string, Subject<any>>();

  constructor(
    private readonly cache: CacheServiceStorage = new Map<string, CacheContent>()
  ) { }

  get DEFAULT_LIFE_TIME() { return DEFAULT_LIFE_TIME }

  /**
   * Gets the value from cache if the key is provided.
   * If no value exists in cache, then check if the same call exists
   * in flight, if so return the subject. If not create a new
   * Subject inFlightObservable and return the source observable.
   * 
   * ```js
   * // get cached value
   * let observable = cacheService.get('key');
   * 
   * // get cached vaule with fallback
   * let observable = cacheService.get('key', () => http.request$('key'));
   * ```
   */
  get<T = any>(key: string, fallback?: () => Observable<T>, maxLifeTime: number = DEFAULT_LIFE_TIME): Observable<T> {

    let cached = this.validCachedValue(key, maxLifeTime);
    if (cached) {
      return of(cached.value);
    }

    if (this.inFlightObservables.has(key)) {
      // cache mis-hit, but there is an observable in flight
      return this.inFlightObservables.get(key)!;
    } else if (fallback) {
      return defer(() => {
        // 构建observable的过程可能很复杂，所以用函数包装
        let fallbackObservable = fallback();
        // cache mis-hit, and not observable in flight, then create a new one
        // apply fallback, and bind it with flight subject.
        let inFlight = new Subject();
        this.inFlightObservables.set(key, inFlight);
        // console.log(`%c Calling api for ${key}`, 'color: purple');
        return fallbackObservable.pipe(
          tap((value) => {
            this.set(key, value);
            inFlight.next(value); // notify value to all given in process observables
            inFlight.complete();
            this.inFlightObservables.delete(key);
          }),
          catchError(err => {
            inFlight.error(err); // notify error
            inFlight.complete();
            this.inFlightObservables.delete(key);
            throw err;
          })
        );
      })
    } else {
      return throwError(() => 'You must offer the fallback observable, if the key is not in cache.');
    }
  }

  /**
   * Sets the value with key in the cache
   * Notifies all observers of the new value
   */
  set(key: string, value: any): void {
    // 记录value被设置的时间
    this.cache.set(key, { value: value, timestamp: Date.now() });
  }

  /**
   * Checks if the a key exists in cache
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * use case
   * * key值会根据请求参数变化的情况，map会不断变大，可以强制删除一些记录
   * @param key 
   * @param maxLifeTime 出生日期 + 最大寿命，和当前时间对比
   * @returns 
   */
  collect(key: string, maxLifeTime: number = DEFAULT_LIFE_TIME) {
    let cached = this.cache.get(key);
    if (cached) {
      if (cached.timestamp + maxLifeTime < Date.now()) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Checks if the key exists and has not expired.
   * And delete the expired value.
   */
  private validCachedValue(key: string, maxLifeTime: number): CacheContent | undefined {
    let cached = this.cache.get(key);
    if (cached) {
      if (cached.timestamp + maxLifeTime < Date.now()) {
        this.cache.delete(key);
        return undefined;
      }
      return cached;
    } else {
      return undefined;
    }
  }
}