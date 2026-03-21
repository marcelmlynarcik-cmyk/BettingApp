declare module 'web-push' {
  export type PushSubscription = {
    endpoint: string
    keys: {
      p256dh: string
      auth: string
    }
  }

  export type SendResult = {
    statusCode?: number
  }

  const webpush: {
    setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void
    sendNotification: (
      subscription: PushSubscription,
      payload?: string,
    ) => Promise<SendResult>
  }

  export default webpush
}
