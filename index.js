const fs = require('fs')
const path = require('path')
const {execSync} = require('child_process')

const REPOS_ROOT = process.env.REPOS_ROOT

if (!REPOS_ROOT) {
  throw new Error('Missing environment variable REPOS_ROOT. Make sure it is set in the .env file')
}

if (!fs.existsSync(REPOS_ROOT)) {
  throw new Error('Environment variable REPOS_ROOT does not point to an existing directory. Make sure it is set in the .env file')
}

const STATUS_PENDING = 'pending'
const STATUS_SUCCESS = 'success'
const STATUS_ERROR = 'error'

module.exports = (robot) => {
  // Plugins that we use
  robot.log('Yay, the app was loaded!')

  // Add webpage that shows current build info (like checked out commit)
  const botInfo = {
    git_sha: execSync(`git rev-parse HEAD`, {cwd: __dirname}).toString().substring(0, 8)
  }
  robot.router.get('/jeeves', async (req, res) => {
    // ensure stats are loaded
    res.json(botInfo)
  })

  // re-deploy on push
  robot.on('push', async ({payload, github}) => {
    // Check if the directory is checked out on this machine so we can re-deploy it

    // if (`refs/heads/${masterBranchName}` === payload.ref) {
    //   // Pushed to master
    // }

    const masterBranchName = payload.repository.default_branch
    const repoOwner = payload.repository.owner.name
    const repoName = payload.repository.name
    const sha = payload.head_commit.id
    const repoRoot = `${REPOS_ROOT}/${repoOwner}/${repoName}`

    async function updateStatus (state, description) {
      // GitHub requires that descripitons be <= 140 characters
      if (description && description.length > 140) {
        description = description.substring(0, 140)
      }
      return github.repos.createStatus({
        owner: repoOwner,
        repo: repoName,
        sha: sha,
        state: state,
        description: description,
        // target_url: `https://github.com/${repoOwner}/${repoName}/commit/${sha}`,
        context: 'jeeves/deploy'
      })
    }

    function execCommand (command) {
      robot.log(`Executing "${command}"`)
      const args = {
        cwd: repoRoot,
        stdio: [null, process.stdout, process.stderr]
      }
      execSync(command, args)
    }

    if (fs.existsSync(path.join(REPOS_ROOT, repoOwner, repoName))) {
      try {
        // deploy locally (we are using nodemon to start this whole thing off so it will reboot)
        await updateStatus(STATUS_PENDING, 'Checking out code')
        // execCommand(`git fetch origin "${sha}"`)
        // execCommand(`git checkout FETCH_HEAD`)
        execCommand(`git checkout ${masterBranchName}`)
        execCommand(`git pull`)
        execCommand(`git checkout "${sha}"`)

        // Install any packages
        await updateStatus(STATUS_PENDING, 'Installing Packages')
        execCommand(`./script/setup`)

        await updateStatus(STATUS_PENDING, 'Restarting')
        execCommand(`./script/restart`)

        await updateStatus(STATUS_SUCCESS, 'Deployed')
      } catch (err) {
        await updateStatus(STATUS_ERROR, err.message)
      }
    }
  })
}
