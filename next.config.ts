import createMDX from '@next/mdx'
import type { NextConfig } from 'next'

const withMDX = createMDX({
  options: {
    // If you use remark-gfm, you'll need to use next.config.mjs
    // as the package is ESM only
    // https://github.com/remarkjs/remark-gfm#install
    mdExtensions: ['.mdx'],
  },
})

const nextConfig: NextConfig = {
  pageExtensions: ['js', 'jsx', 'mdx', 'ts', 'tsx'],
  // Google SDKs resolve transport and package metadata files at runtime.
  serverExternalPackages: ['@google-analytics/data', '@googleapis/searchconsole', 'googleapis'],
}

export default withMDX(nextConfig)
