# frozen_string_literal: true

require 'safe_yaml'
require 'uri'
require 'octokit'
require 'pathname'

require 'json_schemer'
require 'up_for_grabs_tooling'

files = ARGV

if files.empty?
  puts 'No project files need to be validated'
  exit 0
end

root = ENV['GITHUB_WORKSPACE']

schema = Pathname.new("#{root}/schema.json")
schemer = JSONSchemer.schema(schema)

# this file seems to not include the expected `/github` root folder name
# test this and we may have to adjust these rules
unless ENV['GITHUB_EVENT_PATH']
  puts "Expected environment variable GITHUB_EVENT_PATH was not set"
  exit 1
end

payload_relative_path = ENV['GITHUB_EVENT_PATH']

unless File.exists?(payload_relative_path)
  puts "Environment variable GITHUB_EVENT_PATH points to file that doesn't exist"
  exit 1
end

json_text = File.read(payload_relative_path)

obj = JSON.parse(json_text)

# TODO: read json payload for event from location on disk

def repository_check(project)
  result = GitHubRepositoryActiveCheck.run(project)

  if result[:rate_limited]
    puts 'This script is currently rate-limited by the GitHub API'
    puts 'Marking as inconclusive to indicate that no further work will be done here'
    exit 0
  end

  return "The GitHub repository '#{project.github_owner_name_pair}' has been marked as archived, which suggests it is not active." if result[:reason] == 'archived'

  return "The GitHub repository '#{project.github_owner_name_pair}' cannot be found. Please confirm the location of the project." if result[:reason] == 'missing'

  return "The GitHub repository '#{result[:old_location]}' is now at '#{result[:location]}'. Please update this project before this is merged." if result[:reason] == 'redirect'

  return "The GitHub repository '#{project.github_owner_name_pair}' could not be confirmed. Error details: #{result[:error]}" if result[:reason] == 'error'

  nil
end

def find_label(project)
  yaml = project.read_yaml
  yaml['upforgrabs']['name']
end

def label_check(project)
  result = GitHubRepositoryLabelActiveCheck.run(project)

  if result[:rate_limited]
    puts 'This script is currently rate-limited by the GitHub API'
    puts 'Marking as inconclusive to indicate that no further work will be done here'
    exit 0
  end

  label = find_label(project)

  if result[:reason] == 'repository-missing'
    return "I couldn't find the GitHub repository '#{project.github_owner_name_pair}' that was used in the `upforgrabs.link` value. Please confirm this is correct or hasn't been mis-typed."
  end

  if result[:reason] == 'missing'
    return "The `upforgrabs.name` value '#{label}' isn't in use on the project in GitHub. This might just be a mistake due because of copy-pasting the reference template or be mis-typed. Please check the list of labels at https://github.com/#{project.github_owner_name_pair}/labels and update the project file to use the correct label."
  end

  yaml = project.read_yaml
  link = yaml['upforgrabs']['link']
  url = result[:url]

  link_needs_rewriting = link != url && link.include?('/labels/')

  if link_needs_rewriting
    return "The label '#{label}' for GitHub repository '#{project.github_owner_name_pair}' does not match the specified `upforgrabs.link` vlaue. Please update it to `#{url}`."
  end

  nil
end

def validate_project(project, schemer)
  validation_errors = ProjectValidator.validate(project, schemer)

  return { project: project, kind: 'validation', validation_errors: validation_errors } if validation_errors.any?

  # TODO: label suggestions should be their own thing?

  return { project: project, message: message } unless project.github_project?

  repository_error = repository_check(project)

  return { project: project, kind: 'repository', message: repository_error } unless repository_error.nil?

  label_error = label_check(project)

  return { project: project, kind: 'label', message: label_error } unless label_error.nil?

  { project: project, kind: 'valid' }
end

projects = files.map do |f|
  full_path = File.join(root, f)
  Project.new(f, full_path)
end


# TODO: delete earlier issue comment if made by same author (login == "github-actions" && __typename == "Bot")
# and starts with the magic preamble <!-- PULL REQUEST ANALYZER GITHUB ACTION -->

# query ($owner: String!, $name: String!, $number: Int!) {
#   repository(owner: $owner, name: $name) {
#     pullRequest(number: $number) {
#       comments(first: 50) {
#         nodes {
#           id
#           body
#           author {
#             login
#             __typename
#           }
#         }
#       }
#     }
#   }
# }



markdown_body = "<!-- PULL REQUEST ANALYZER GITHUB ACTION -->

:wave: I'm a robot checking the state of this pull request to ensure everything will be fine when merging. I noticed this PR added or modififed the data files under `_data/projects` so I had a look at what's changed.

As you make changes to this pull request, I'll re-run these checks to ensure this can be merged by the time someone reviews it.

"

messages = projects.map { |p| validate_project(p, schemer) }.map do |result|
  path = result[:project].relative_path

  if result[:kind] == 'valid'
    "#### `#{path}` :white_check_mark: \nNo problems found, everything should be good to merge!"
  elsif result[:kind] == 'validation'
    message = result[:validation_errors].map { |e| "> - #{e}" }.join "\n"
    "#### `#{path}` :x:\nI had some troubles parsing the project file, or there were fields that are missing that I need. Here's the details:\n#{message}"
  elsif result[:kind] == 'repository' || result[:kind] == 'label'
    "#### `#{path}` :x:\n#{result[:message]}"
  else
    "#### `#{path}` :question:\nI got a result of type '#{result[:kind]}' that I don't know how to handle. I need to mention @shiftkey here as he might be able to fix it."
  end
end

markdown_body += messages.join("\n\n")

puts markdown_body
