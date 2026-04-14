// Clove - React Context Provider

import React, { createContext, useContext } from "react";
import type { CloveClient } from "../core/client.js";
import type { CloveProviderProps } from "./types.js";

/** Internal React context holding the CloveClient instance. */
const CloveContext = createContext<CloveClient | null>(null);

/**
 * Provides a `CloveClient` instance to all nested React components.
 *
 * Any component using `useClove()` or `useCloveMutation()` must be
 * a descendant of `CloveProvider`.
 *
 * @example
 * ```tsx
 * import { clove } from 'clove';
 * import { CloveProvider } from 'clove/react';
 *
 * const api = clove.create({
 *   baseURL: 'https://api.example.com',
 *   retry: { attempts: 3 },
 * });
 *
 * function App() {
 *   return (
 *     <CloveProvider client={api}>
 *       <MyApp />
 *     </CloveProvider>
 *   );
 * }
 * ```
 */
export function CloveProvider({ client, children }: CloveProviderProps): React.JSX.Element {
  return React.createElement(CloveContext.Provider, { value: client }, children);
}

/**
 * Internal hook to access the CloveClient from context.
 * Throws a clear error if used outside of a `CloveProvider`.
 */
export function useCloveClient(): CloveClient {
  const client = useContext(CloveContext);
  if (!client) {
    throw new Error(
      "useClove/useCloveMutation must be used within a <CloveProvider>. " +
        "Wrap your component tree with <CloveProvider client={cloveInstance}>.",
    );
  }
  return client;
}
