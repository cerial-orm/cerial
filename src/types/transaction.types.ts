/**
 * Transaction-specific type definitions for callback mode and transaction client
 */

/**
 * Callback function for transaction callback mode.
 * Receives a TransactionClient and returns a promise or value.
 *
 * @template R - The return type of the callback
 */
export type TransactionCallbackFn<R> = (tx: TransactionClient) => Promise<R> | R;

/**
 * Options for transaction execution
 */
export interface TransactionOptions {
  /** Optional timeout in milliseconds for the transaction */
  timeout?: number;
}

/**
 * Transaction client - mirrors TypedDb but without $transaction method.
 * Used as the parameter type for transaction callback functions.
 *
 * This is a generic interface that represents the model-access pattern.
 * The actual implementation is generated per-project with model-specific properties.
 */
export interface TransactionClient {
  [key: string]: any;
}
