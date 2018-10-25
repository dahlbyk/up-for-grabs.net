up-for-grabs.net
================

Do you run or participate in an open-source project? Submit a Pull Request to add it to the list!

Visit the website: [up-for-grabs.net](https://up-for-grabs.net/)

**Note:** this project is governed by a [Code of Conduct](https://github.com/up-for-grabs/up-for-grabs.net/blob/gh-pages/CODE_OF_CONDUCT.md) which applies to all contributors to the project.

## Add a project

- Each of the projects is a file in the [projects](https://github.com/up-for-grabs/up-for-grabs.net/blob/gh-pages/_data/projects/) folder.
- To add a new one, create a new file named after the project, ending in `.yml`. 
- Ensure all spaces and special characters are replaced with `-`, to make everyone's life easier. 
- [This guide](https://help.github.com/articles/creating-new-files/) shows you how to create the file directly in the browser, without cloning the repository in the command line.

The contents of the file are just some details about the project:

```yaml
name: *project name*
desc: *a brief description of the project*
site: *home page or repository URL*
tags:
# Note: these are tags categorizing the project, not issue labels.
- *tags*
- *to*
- *search*
- *on*
upforgrabs:
  name: *the label associated with the up-for-grabs tasks -- e.g. "help needed" (without the quotes)*
  link: *URL where users can view the tasks -- e.g. https://github.com/username/project/labels/up%20for%20grabs*
```

Check out the [up-for-grabs](https://github.com/up-for-grabs/up-for-grabs.net/blob/gh-pages/_data/projects/up-for-grabs.net.yml) file for an example of this project structure.

## Use the Yeoman Generator

If you'd like to use a generator to create the project's file, you can certainly do so!

Install the generator, then run it and walk through the steps.

```
npm install -g generator-up-for-grabs
yo up-for-grabs
```

## Testing the site locally

If you haven't already, clone the repository to your machine:

```
git clone https://github.com/up-for-grabs/up-for-grabs.net.git
```

If you have a fork of the repository, change `up-for-grabs` into your GitHub account name above.

You need Ruby and Bundler installed to test the site - you can confirm these are present by running these commands:

```
ruby -v
bundle -v
```

If you're happy with that, run these commands in the directory where you cloned the up-for-grabs repository:

```
bundle install
jekyll serve --watch
```

Alternatively, the application can be run in a [Docker](https://docker.com) container:

```
docker-compose up
```

Then open your browser to `localhost:4000` to view the site.

## How This All Works
We use a few great features of Jekyll and GitHub Pages to host this entire site for free.

* We are using a file called `scripts.html` which is an include file. When we publish the site, Jekyll uses this to concatenate and generate the scripts that will actually be downloaded when a user visits the site.
* Within the `scripts.html` template, we're referencing `site.data.projects`, which gives us access to the entire directory of `.yml` files as a set of variables. We combine this with the `jsonify` liquid transformer to turn them into a JSON object. This means that the raw data is generated once, so it downloads very quickly as static data.
* When the web page is opened, our startup JS processes each project in the array of projects and pushes it into the array that the rest of the site uses.
* We use [travis-ci](https://travis-ci.org/up-for-grabs/up-for-grabs.net) to run a custom ruby script, `cibuild`, that checks all the `.yml` files to make sure they can be appropriately parsed. This makes sure we don't merge any incorrectly formed project files.

What this means is that, when a pull request is merged, GitHub Pages automatically builds the site via Jekyll and publishes it to our GitHub -- no database or hosting needed. (Thanks, GitHub!)
