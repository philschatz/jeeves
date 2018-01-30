const fs = require('fs')
const path = require('path')
const {execSync} = require('child_process')

const REPOS_ROOT = process.env.REPOS_ROOT

if (!REPOS_ROOT) {
  throw new Error('Missing environment variable REPOS_ROOT. Make sure it is set in the .env file')
}

const STATUS_PENDING = 'pending'
const STATUS_SUCCESS = 'success'
const STATUS_ERROR = 'error'

module.exports = (robot) => {
  // Plugins that we use
  console.log('Yay, the app was loaded!')

  robot.on('push', async ({payload, github}) => {
    console.log('pushed code')
    // Check if the directory is checked out on this machine so we can re-deploy it

    // if (`refs/heads/${masterBranchName}` === payload.ref) {
    //   // Pushed to master
    // }

    const masterBranchName = payload.repository.default_branch
    const repoOwner = payload.repository.owner.name
    const repoName = payload.repository.name

    if (fs.existsSync(path.join(REPOS_ROOT, repoOwner, repoName))) {

      const sha = payload.head_commit.id
      const tree = payload.head_commit.tree_id
      const repoRoot = `${REPOS_ROOT}/${repoOwner}/${repoName}`

      async function updateStatus(state, description) {
        // GitHub requires that descripitons be <= 140 characters
        if (description && description.length > 140) {
          description = description.substring(0, 140)
        }
        return await github.repos.createStatus({
          owner: repoOwner,
          repo: repoName,
          sha: sha,
          state: state,
          description: description,
          target_url: `https://github.com/${repoOwner}/${repoName}/commit/${sha}`,
          context: 'jeeves/deploy'
        })
      }

      function execCommand(command) {
        console.log(`Executing "${command}"`)
        const args = {
          cwd: repoRoot,
          stdio: [ null, process.stdout, process.stderr]
        }
        execSync(command, args)
      }

      try {
        // deploy locally (we are using nodemon to start this whole thing off so it will reboot)
        updateStatus(STATUS_PENDING, 'Checking out code')
        // execCommand(`git fetch origin "${sha}"`)
        // execCommand(`git checkout FETCH_HEAD`)
        execCommand(`git checkout ${masterBranchName}`)
        execCommand(`git pull`)
        execCommand(`git checkout "${sha}"`)

        // Install any packages
        updateStatus(STATUS_PENDING, 'Installing Packages')
        execCommand(`./script/setup`)

        updateStatus(STATUS_SUCCESS, 'Deployed')
      } catch (err) {
        updateStatus(STATUS_ERROR, err.message)
      }
    }
  })



}
