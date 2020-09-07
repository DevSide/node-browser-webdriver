const nodeFetch = require('node-fetch')
const { execSync } = require('child_process')
const { readFile, writeFile } = require('fs').promises

const RETRY_HTTP = 3
const RETRY_TIMEOUT_FACTOR = 2000
const currentDate = new Date().toISOString().substring(0, 10)
const TAG_REGEX = /^chrome([0-9.]+)-node([0-9.]+)/

function stringifyTag (chromeVersion, nodeVersion) {
  return `chrome${chromeVersion}-node${nodeVersion}`
}

function parseTag (tag) {
  const match = tag.match(TAG_REGEX)

  if (match) {
    const [,chromeVersion,nodeVersion] = tag.match(TAG_REGEX)

    return [chromeVersion, nodeVersion]
  }

  return null
}

async function request(type, ...params) {
  let retry = 0

  while(++retry <= RETRY_HTTP) {
    try {
      const res = await nodeFetch(...params)

      if (res.status >= 200 && res.status < 300) {
        return res[type]();
      }

      throw new Error(`Fetch ${type} failed on ${params[0]}. Status ${res.status}.`)
    } catch (error) {
      if (retry === RETRY_HTTP) {
        throw error
      }

      const nextRetry = retry * RETRY_TIMEOUT_FACTOR
      console.info(`${error.message} Retrying in ${nextRetry}ms...`)
      await new Promise(resolve => setTimeout(resolve, nextRetry))
    }
  }
}

function removeVersionPrefix(version) {
  if (version.startsWith('v')) {
    return version.substring(1)
  }

  return version
}

async function fetchActiveNodeMajorVersions () {
  const nodeReleases = await request(`json`, `https://raw.githubusercontent.com/nodejs/Release/master/schedule.json`)

  const result = Object.entries(nodeReleases)
    .filter(([,release]) => release.end >= currentDate)
    .map(([version,]) => version)

  console.info('fetchActiveNodeMajorVersions', result)

  return result
}


async function fetchLatestNodeVersions (majorVersions = []) {
  const releases = await request(`json`, `https://nodejs.org/download/release/index.json`)

  const result = releases.map(release => release.version)

  console.info('fetchLatestNodeReleases', result.length)

  return result
}

async function fetchLastStableChromeVersionLinux () {
  const builds = await request(`json`, `https://www.chromestatus.com/omaha_data`)

  const result = builds
    .filter(build => build.os === 'linux')
    .map(build => build.versions.find(buildVersion => buildVersion.channel === 'stable'))
    .map(buildVersion => buildVersion ? buildVersion.version : '')[0]

  console.info('fetchLastStableChromeVersionLinux', result)

  return result
}

async function fetchExistingTags () {
  execSync('git fetch --tags')

  const result = execSync('git tag -l')
    .toString()
    .split('\n')
    .filter(tag => !!tag)

  console.info('getExistingTags', result.length)

  return result
}

async function findChromeDriverVersion (chromeVersion) {
  const chromeMainVersion = chromeVersion.replace(/.(\w+)$/, '')

  const chromedriverVersion = await request(`text`, `https://chromedriver.storage.googleapis.com/LATEST_RELEASE_${chromeMainVersion}`)

  console.info('findChromeDriverVersion', chromedriverVersion)

  return chromedriverVersion
}

function filterLastestNodeVersionPerMajorVersion(nodeVersions, majorVersions = []) {
  const result = majorVersions
    .map(majorVersion => nodeVersions.find(version => version.startsWith(majorVersion)))
    .filter(lastRelease => !!lastRelease)

  console.info('filterLastestNodeVersionPerMajorVersion', result)

  return result
}

async function doesDockerNodeExist (nodeVersion) {
  try {
    await request(`json`, `https://registry.hub.docker.com/v1/repositories/node/tags/${nodeVersion}`)

    return true
  } catch (error) {
    console.error(error)
    return false
  }
}

async function createTagWithDockerfile (tag, content) {
  await writeFile(`./Dockerfile`, content)

  execSync([
    `git add ./Dockerfile`,
    `git commit -m "${tag}"`,
    `git tag ${tag}`,
    `git push origin ${tag}`,
    `git reset --soft HEAD~1`,
    `git reset HEAD ./Dockerfile`,
    `rm ./Dockerfile`,
  ].join(' && '))
}

async function chromeDockerfiles() {
  const [
    activeNodeMajorVersions,
    latestNodeVersions,
    lastStableChromeVersionLinux,
    existingTags,
  ] = await Promise.all([
    fetchActiveNodeMajorVersions(),
    fetchLatestNodeVersions(),
    fetchLastStableChromeVersionLinux(),
    fetchExistingTags(),
  ])

  const chromeVersion = removeVersionPrefix(lastStableChromeVersionLinux)
  const chromedriverVersion = await findChromeDriverVersion(chromeVersion)
  const nodeVersions = filterLastestNodeVersionPerMajorVersion(latestNodeVersions, activeNodeMajorVersions).map(removeVersionPrefix)

  const nodeVersionsExist = await Promise.all(nodeVersions.map(doesDockerNodeExist))
  const currentVersions = nodeVersions
    .filter((_, i) => nodeVersionsExist[i])
    .map(nodeVersion => [chromeVersion, nodeVersion])
  const existingVersions = existingTags.map(parseTag).filter(x => x !== null)

  const newVersions = currentVersions.filter(
    ([chromeVersion, nodeVersion]) => !existingVersions.some(
      ([ existingChromeVersion, existingNodeVersion ]) => existingChromeVersion === chromeVersion && existingNodeVersion === nodeVersion
    )
  )

  if (!newVersions.length) {
    console.info('All versions/tags are already generated.')
    return
  }

  console.info('newVersions', newVersions)

  const template = (await readFile('./Dockerfile-chrome.template')).toString()

  for await (const [chromeVersion,nodeVersion] of newVersions) {
    const content = template
      .replace('%NODE_VERSION%', nodeVersion)
      .replace('%CHROME_VERSION%', chromeVersion)
      .replace('%CHROMEDRIVER_VERSION%', chromedriverVersion)

    const tag = stringifyTag(chromeVersion, nodeVersion)

    if (process.env.TRAVIS_BRANCH === `master`) {
      await createTagWithDockerfile(tag, content)
    } else {
      console.info('Dockerfile generation only happens on master branch.')
      console.info(tag, content)
    }
  }
}

exports.chromeDockerfiles = chromeDockerfiles
