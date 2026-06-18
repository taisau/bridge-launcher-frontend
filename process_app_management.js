const fs = require('fs')
const path = require('path')

const mdPath = path.join(__dirname, 'app_management.md')
const content = fs.readFileSync(mdPath, 'utf-8')

const hiddenApps = []
const customLabels = {}

for (const line of content.split('\n')) {
  if (!line.startsWith('- [')) continue

  const pkgMatch = line.match(/<!--\s*(.+?)\s*-->/)
  if (!pkgMatch) continue

  const packageName = pkgMatch[1]
  const isHidden = line.includes('[ ]')
  const afterComment = line.slice(line.lastIndexOf('-->') + 3).trim()
  const label = afterComment.startsWith(',') ? afterComment.slice(1).trim() : null

  if (isHidden) hiddenApps.push(packageName)
  if (label) customLabels[packageName] = label
}

fs.writeFileSync(path.join(__dirname, 'hidden_apps.json'), JSON.stringify(hiddenApps, null, 2) + '\n')
fs.writeFileSync(path.join(__dirname, 'custom_labels.json'), JSON.stringify(customLabels, null, 2) + '\n')

console.log(`hidden_apps.json: ${hiddenApps.length} apps`)
console.log('custom_labels.json:')
for (const [pkg, label] of Object.entries(customLabels)) {
  console.log(`  ${pkg} => "${label}"`)
}
