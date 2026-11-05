import mongoose from 'mongoose'

let connectionPromise

export const connectedDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection
  }

  const mongoUri = process.env.MONGO_URI || process.env.MONGO_URL
  if (!mongoUri) {
    throw new Error('MONGO_URI (or legacy MONGO_URL) is not set in environment variables')
  }

  if (
    !connectionPromise ||
    mongoose.connection.readyState === 0 ||
    mongoose.connection.readyState === 3
  ) {
    connectionPromise = mongoose.connect(mongoUri)
      .then((connection) => {
        console.log(`Connected to MongoDB: ${connection.connection.host}`)
        return connection
      })
      .catch((error) => {
        connectionPromise = undefined
        throw error
      })
  }

  return connectionPromise
}
  