export interface BridgeApp {
  packageName: string
  label: string
  url?: string
  isPwa?: boolean
  isAction?: boolean
  action?: () => void
}
