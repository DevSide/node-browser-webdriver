const { chromeDockerfiles } = require('./chrome')

chromeDockerfiles().then(
  () => {
    process.exit(0)
  },
  error => {
    console.error(error.message)
    process.exit(1)
  }
)
