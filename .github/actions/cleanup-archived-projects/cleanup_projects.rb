# frozen_string_literal: true

require 'safe_yaml'
require 'uri'
require 'octokit'
require 'pathname'

require 'up_for_grabs_tooling'

def existing_pull_request?(current_repo)
  client = Octokit::Client.new(access_token: ENV['GITHUB_TOKEN'])
  prs = client.pulls current_repo

  found_pr = prs.find { |pr| pr.title == 'Remove projects detected as deprecated' && pr.user.login == 'github-actions[bot]' }

  if found_pr
    puts "There is a open PR to remove deprecated projects ##{found_pr.number} - review and merge that before we try again"
    true
  else
    false
  end
end

def cleanup_deprecated_projects(root, current_repo, projects)
  client = Octokit::Client.new(access_token: ENV['GITHUB_TOKEN'])

  list = ''

  projects.each do |r|
    project = r[:project]
    file = project.full_path
    File.delete(file) if File.exist?(file)
    list += " - \`#{project.relative_path}\` - '#{r[:reason]}'\n"
  end

  clean = true

  branch_name = Time.now.strftime('deprecated-projects-%Y%m%d')

  Dir.chdir(root) do
    system('git config --global user.name "github-actions"')
    system('git config --global user.email "github-actions@users.noreply.github.com"')

    system("git remote set-url origin 'https://x-access-token:#{ENV['GITHUB_TOKEN']}@github.com/#{current_repo}.git'")

    clean = system('git diff --quiet > /dev/null')

    unless clean
      system("git checkout -b #{branch_name}")
      system("git commit -am 'removed deprecated projects'")
      system("git push origin #{branch_name}") if apply_changes
    end
  end

  return if clean

  title = 'Remove projects detected as deprecated'
  body = "This PR removes projects that have been marked as archived by the GitHub API, or cannot be found:\n\n #{list}"

  client.create_pull_request(current_repo, 'gh-pages', branch_name, title, body) if apply_changes
end

def verify_project(project)
  result = GitHubRepositoryActiveCheck.run(project)

  if result[:rate_limited]
    puts 'This script is currently rate-limited by the GitHub API'
    puts 'Marking as inconclusive to indicate that no further work will be done here'
    exit 78
  end

  return { project: project, deprecated: true, reason: 'archived' } if result[:reason] == 'archived'

  return { project: project, deprecated: true, reason: 'missing' } if result[:reason] == 'missing'

  return { project: project, deprecated: false, reason: 'redirect', old_location: result[:old_location], location: result[:location] } if result[:reason] == 'redirect'

  return { project: project, deprecated: false, reason: 'error', error: result[:error] } if result[:reason] == 'error'

  { project: project, deprecated: false }
end

current_repo = ENV['GITHUB_REPOSITORY']

puts "Inspecting projects files for '#{current_repo}'"

start = Time.now

root = ENV['GITHUB_WORKSPACE']

return if existing_pull_request?(current_repo)

projects = Project.find_in_directory(root)
github_projects = projects.filter(&:github_project?)
non_github_projects = projects.reject(&:github_project?)

results = github_projects.map { |p| verify_project(p) }

active_projects = results.filter { |r| r[:deprecated] == false }
deprecated_projects = results.filter { |r| r[:deprecated] == true }
projects_with_errors = results.filter { |r| !r[:error].nil? }
projects_with_redirect = results.filter { |r| r[:reason] == 'redirect' }

errors = projects_with_errors.count + deprecated_projects.count
success = active_projects.count
skipped = non_github_projects.count

puts "#{success} files checked, #{skipped} ignored, #{errors} errors found"
puts ''

projects_with_errors.each do |r|
  puts "Encountered error while trying to validate '#{r[:project].relative_path}' - #{r[:error]}"
end

projects_with_redirect.each do |r|
  puts "Project #{r[:project].relative_path} needs to be updated from '#{r[:old_location]}' to '#{r[:location]}'"
end

deprecated_projects.each do |r|
  puts "Project is considered deprecated: '#{r[:project].relative_path}' - reason '#{r[:reason]}'"
end

if deprecated_projects.any?
  cleanup_deprecated_projects(root, current_repo, deprecated_projects)
else
  puts 'No deprecated projects found...'
end

finish = Time.now
delta = finish - start

puts "Operation took #{delta}s"
