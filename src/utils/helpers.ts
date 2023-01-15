const getTimestamp = () => new Date().getTime()

const randomWait = async (min = 1000, max = 2000) => {
  await new Promise(resolve => {
    setTimeout(resolve, Math.floor(Math.random() * (max - min) + min))
  })
}

const diffTimeInSeconds = (time1: number, time2: number) => {
  const diff = Math.abs(time1 - time2)

  return parseFloat((diff / 1000).toFixed(3))
}

export { getTimestamp, randomWait, diffTimeInSeconds }
