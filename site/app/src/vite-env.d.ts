/// <reference types="vite/client" />

import 'react'

declare module 'react' {
  interface ImgHTMLAttributes<T> extends HTMLAttributes<T> {
    /**
     * The DOM attribute spelling of the priority hint.
     *
     * React 18 does not recognise its own camelCase `fetchPriority` prop and
     * logs a console warning on every render; React 19 accepts it. The
     * lowercase spelling is the actual HTML attribute and is passed straight
     * through by both, so it is what we write. React 18's typings omit it,
     * hence this declaration — which stays correct after a React 19 upgrade.
     */
    fetchpriority?: 'high' | 'low' | 'auto'
  }
}
