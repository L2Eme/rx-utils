import { tap, MonoTypeOperatorFunction } from 'rxjs'

const enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	NONE = 2,
}

/**
 * ```js
 * this.debug('a', 1)
 * 
 * interval(1000).pipe(
 *   // debug is a tap function
 *   this.debug_$op(v => `put ${v}`),
 * )
 * ```
 */
export class LogServiceBase {

	private _logLevel: LogLevel = LogLevel.INFO

	constructor(private prefix: string) {}

	setLogLevel(level: 0 | 1 | 2) {
		this._logLevel = level;
	}

	debug(...msg: any[]) {
		if (this._logLevel <= LogLevel.DEBUG) {
			console.log(this.prefix, ...msg)
		}
	}

	info(...msg: any[]) {
		if (this._logLevel <= LogLevel.INFO) {
			console.log(this.prefix, ...msg)
		}
	}

	debug_$op<T>(cb: (v: T) => any): MonoTypeOperatorFunction<T> {
		return (source$) => {
			return source$.pipe(
				tap(v => {
					if (this._logLevel <= LogLevel.DEBUG) {
						let msg = cb(v)
						console.log(this.prefix, msg)
					}
				})
			)
		}
	}

	info_$op<T>(cb: (v: T) => any): MonoTypeOperatorFunction<T> {
		return (source$) => {
			return source$.pipe(
				tap(v => {
					if (this._logLevel <= LogLevel.INFO) {
						let msg = cb(v)
						console.log(this.prefix, msg)
					}
				})
			)
		}
	}

}