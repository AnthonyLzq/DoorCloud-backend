class CustomError extends Error {
  constructor(message: string, public code: number = 500) {
    super(message)
  }
}

export { CustomError }
