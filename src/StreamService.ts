import {
	Observable, Subject, EMPTY,
	filter, takeUntil, mergeMap, shareReplay, catchError, throttleTime,
	of, race, skipUntil, timer, take, map,
} from 'rxjs';

export type StreamHandler = {
	stream$: Observable<any>,
	update: (payload: any) => void,
	clear: () => void,
}

/**
 * ### use case
 * * 相同的key，尽量使用相同的queryOnce方法
 * * queryOnce的error会被忽略，自定义需要的错误值，如果你想监听到的话
 */
export class StreamService {

	private readonly streams: Map<string, StreamHandler> = new Map()

	/**
	 * ### 注册stream，并返回
	 * * 默认情况下update有一秒的限制
	 * * clear方法并没有频率限制
	 * @param key ke to identify the stream
	 * @param queryOnce query function to return an observable
	 * @param updateThrottleTime default update throttle is 1 second
	 * @returns 
	 */
	registerStream$<T = any>(key: string, queryOnce: (payload: any) => Observable<T>, updateThrottleTime: number = 1000) {
		if (this.streams.has(key)) {
			throw new Error(`register a duplcated key ${key}`)
		}

		let clear$ = new Subject<void>()
		let clear = () => clear$.next()

		let update$ = new Subject<any>()
		let update = (payload: any) => update$.next(payload)

		let stream$ = update$.pipe(
			throttleTime(updateThrottleTime),
			mergeMap((payload) => {
				return queryOnce(payload).pipe(catchError(() => EMPTY))
			}),
			takeUntil(clear$),
			shareReplay(1),
		)
		this.streams.set(key, { stream$, update, clear });
		return stream$;
	}

	/** sometimes you may want to save the updator/cleaner */
	getHandler(key: string) {
		return this.streams.get(key)
	}

	getStream$(key: string) {
		return this.streams.get(key)?.stream$
	}

	clear(key: string) {
		let entry = this.streams.get(key)
		if (entry) {
			entry.clear()
			this.streams.delete(key)
		}
	}

	clearAll() {
		for (let h of this.streams.values()) {
			h.clear()
		}
		this.streams.clear();
	}

	/**
	 * stream update
	 * * update action can send param
	 * @param key 
	 * @param payload 
	 */
	applyUpdate(key: string, payload?: any) {
		let entry = this.streams.get(key)
		if (entry) {
			entry.update(payload)
		}
	}

	/**
	 * apply update, and return a notification while stream get a new data
	 * @param key 
	 * @param payload 
	 * @param waitFor 
	 * @returns 
	 */
	applyUpdate$(key: string, payload: any, waitFor: number) {
		let entry = this.streams.get(key)
		if (entry) {
			entry.update(payload)
			return race(
				entry.stream$.pipe(
					// 第一次获取时，没有缓存值，所以即便是有数据，也不会立刻更新
					// 如果在1毫秒之内就返回，说明不是经过网络链接获得的数据，如果谁的网络延迟是1毫秒，那也没办法了。
					skipUntil(timer(1)), take(1), map(() => true),
				),
				timer(waitFor).pipe(
					map(() => false)
				)
			)
		}
		else {
			return of(true)
		}
	}

}