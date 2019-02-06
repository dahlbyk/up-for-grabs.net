(function(host, _) {
  var applyTagsFilter = function(projects, tagsMap, tags) {
    if (typeof tags === "string") {
      tags = tags.split(",");
    }

    tags = _.map(tags, function(entry) {
      return entry && entry.replace(/^\s+|\s+$/g, "");
    });

    if (!tags || !tags.length || tags[0] == "") {
      return projects;
    }

    var projectNames = _.uniq(
      _.flatten(
        _.map(tags, function(tag) {
          var hit = tagsMap[tag.toLowerCase()];
          return (hit && hit.projects) || [];
        })
      )
    );

    return _.filter(projects, function(project) {
      return _.contains(projectNames, project.name);
    });
  };

  /*
   * The function here is used for front end filtering when given
   * selecting certain projects. It ensures that only the selected projects
   * are returned. If none of the names was added to the filter.
   * Then it fallsback to show all the projects.
   * @param Array projects : An array having all the Projects in _data
   * @param Array projectsNameSorted : This is another array showing all the
   *              projects in a sorted order
   * @param Array names : This is an array with the given name filters.
   */
  var applyNamesFilter = function(projects, projectNamesSorted, names) {
    if (typeof names === "string") {
      names = names.split(",");
    }

    names = _.map(names, function(entry) {
      return entry && entry.replace(/^\s+|\s+$/g, "");
    });

    if (!names || !names.length || names[0] == "") {
      return projects;
    }

    // Make sure the names are sorted first. Then return the found index in the passed names
    return _.filter(
      _.map(projectNamesSorted, function(entry, key) {
        if (names.indexOf(String(key)) > -1) {
          return entry;
        }
      }),
      function(entry) {
        return entry || false;
      }
    );
  };

  /*
   * The function here is used for front end filtering when given
   * selecting certain projects. It ensures that only the selected projects
   * are returned. If none of the labels was added to the filter,
   * it fallsback to show all the projects.
   * @param Array projects : An array having all the Projects in _data
   * @param Array projectLabelsSorted : This is another array showing all the
   *        labels in a sorted order
   * @param Array labels : This is an array with the given label filters.
   */
  var applyLabelsFilter = function(projects, projectLabelsSorted, labels) {
    label_indices = labels;

    if (typeof labels === "string") {
      label_indices = labels.split(",");
    }

    labels_indices = _.map(labels, function(entry) {
      return entry && entry.replace(/^\s+|\s+$/g, "");
    });

    // fallback if labels doesnt exist
    if (!label_indices || !label_indices.length || labels[0] == "") {
      return projects;
    }

    // get the corresponding label from projectLabelsSorted with the indices from earlier
    labels = _.filter(projectLabelsSorted, function(entry, key) {
      if (label_indices.indexOf(String(key)) > -1) {
        return entry;
      }
    });

    // collect the names of all labels into a list
    label_names = _.collect(labels, function(label) {
      return label.name;
    });

    // find all projects with the given labels via OR
    results = _.map(label_names, function(name) {
      return _.filter(projects, function(project) {
        return (
          String(project.upforgrabs.name).toLowerCase() === name.toLowerCase()
        );
      });
    });

    // the above statements returns n arrays in an array, which we flatten here and return then
    return _.flatten(results, function(arr1, arr2) {
      return arr1.append(arr2);
    });
  };

  var TagBuilder = function() {
    var _tagsMap = {},
      _orderedTagsMap = null;

    this.addTag = function(tag, projectName) {
      var tagLowerCase = tag.toLowerCase();
      if (!_.has(_tagsMap, tagLowerCase)) {
        _tagsMap[tagLowerCase] = {
          name: tag,
          frequency: 0,
          projects: [],
        };
      }
      var _entry = _tagsMap[tagLowerCase];
      _entry.frequency++;
      _entry.projects.push(projectName);
    };

    this.getTagsMap = function() {
      // https://stackoverflow.com/questions/16426774/underscore-sortby-based-on-multiple-attributes
      return (_orderedTagsMap =
        _orderedTagsMap ||
        _(_tagsMap)
          .chain()
          .sortBy(function(tag, key) {
            return key;
          })
          .sortBy(function(tag) {
            return tag.frequency * -1;
          })
          .value());
    };
  };

  var extractTags = function(projectsData) {
    var tagBuilder = new TagBuilder();
    _.each(projectsData, function(entry) {
      _.each(entry.tags, function(tag) {
        tagBuilder.addTag(tag, entry.name);
      });
    });
    return tagBuilder.getTagsMap();
  };

  var extractProjectsAndTags = function(projectsData) {
    return {
      projects: projectsData,
      tags: extractTags(projectsData),
    };
  };

  /*
   * This function sends a GET Request to Github Rest API v3, finds when each project was
   * last updated, and then sorts the projects descendingly based on that. It returns the list of projects sorted.
   * @param {type} projects An array with all the available projects. It should be similar to
   * the array _projectsData.projects that is created on ProjectsService function. The final
   * sort is called from within the last callback function that processes the last get request, but this
   * operates asynchronously, so the sorted data has to be retrieved from some other place.
   */
  function sortProjectsByRecentlyUpdated (projects) {
    // get url of github repo for each project and keep only {owner}/{repo}.
    var repos = _.map(projects, function(project)
    {
      var repo = null;
      if (project.site.includes("github.com")) {
        repo = project.site;
        if (repo[repo.length-1] === "/") {
          repo = repo.substring(0, repo.length - 1);
        }
        const stems = repo.split("/");
        const repoLocation = stems[stems.length-2] + "/" + stems[stems.length-1];
        return repoLocation;
      }
      else if (project.upforgrabs.link.includes("github.com")){
        repo = project.upforgrabs.link;
        repo = repo.substr(repo.indexOf("github.com")+11);
        const stems = repo.split("/");
        const repoLocation = stems[0] + "/" + stems[1];
        return repoLocation;
      }
      else {
        return null;
      }
    });

    var count = 0;
    /*
     * Callback function that handles the response from each GET Request.
     * It reads the JSON data from Github Rest API and stores the 'updated_at' value
     * of the project together with the other info for it. The timestamp info is put at the
     * entry for that project in the projects array. When all responses have been processed,
     * this function calls the sorting function.
     * @param int index the position of the project in the projects array
     * @returns {Function}
     */
    function createResponseHandlerFunction (index) {
      return function () {
        if (this.readyState == 4 && this.status == 200) {
          var objResponse = JSON.parse(this.responseText);
          if (objResponse.updated_at != null) {
            projects[index].lastUpdateTime = objResponse.updated_at;
          }
          count++;
          if (count==totalNeeded){
            //got all responses from GET Requests.
            sortBasedOnUpdateTime();
          }
        }
      };
    }

    var projectsSorted = [];

    /*
     * Sorts the projects based on the timestamp when they were last updated on Github.
     * Projects that don't have a valid github repository url will end up at the end of the list.
     */
    function sortBasedOnUpdateTime () {
      projectsSorted = _.sortBy(projects, function (project) {
        if (project.lastUpdateTime != null) {
          return (new Date(project.lastUpdateTime)).getTime();
        }
        else {
          return 0;
        }
      });
      // skip reverse if you need asc order.
      projectsSorted = projectsSorted.reverse();
      return projectsSorted;
    }

    /* How many repositories will be queried for date info on Github API. Github allows 60 requests/hour
     * for non-registered applications. This can be increased to 5000/hour if using some  form of OAuth.
     */
    var queryProjects = 5;
    var totalNeeded = queryProjects;

    for (var i = 0; i < queryProjects; i++) {
      var indexOfProject = i;
      if (repos[i] != null) {
        var theUrl = "https://api.github.com/repos/" + repos[i];
        var xmlHttp = new XMLHttpRequest();
        xmlHttp.onreadystatechange = createResponseHandlerFunction(indexOfProject);
        xmlHttp.open("GET", theUrl, true); // true for asynchronous
        xmlHttp.send(null);
      }
      else {
        // this means that this project did not have a valid github repo url, so it won't be sorted.
        totalNeeded--;
      }
    }
  }

  var ProjectsService = function(projectsData) {
    var _projectsData = extractProjectsAndTags(projectsData);
    var tagsMap = {};
    var namesMap = {};
    var labelsMap = {};

    var canStoreOrdering =
      JSON &&
      sessionStorage &&
      sessionStorage.getItem &&
      sessionStorage.setItem;
    var ordering = null;
    if (canStoreOrdering) {
      ordering = sessionStorage.getItem("projectOrder");
      if (ordering) {
        ordering = JSON.parse(ordering);

        // This prevents anyone's page from crashing if a project is removed
        if (ordering.length !== _projectsData.projects.length) {
          ordering = null;
        }
      }
    }

    if (!ordering) {
      ordering = _.shuffle(_.range(_projectsData.projects.length));
      if (canStoreOrdering) {
        sessionStorage.setItem("projectOrder", JSON.stringify(ordering));
      }
    }

    var projects = _.map(ordering, function(i) {
      return _projectsData.projects[i];
    });

    _.each(_projectsData.tags, function(tag) {
      tagsMap[tag.name.toLowerCase()] = tag;
    });

    _.each(_projectsData.projects, function(project) {
      if (project.name.toLowerCase) {
        namesMap[project.name.toLowerCase()] = project;
      }
    });

    _.each(_projectsData.projects, function(project) {
      labelsMap[project.upforgrabs.name.toLowerCase()] = project.upforgrabs;
    });

    this.get = function(tags, names, labels) {
      var filtered_projects = projects;
      if (names && names.length) {
        filtered_projects = applyNamesFilter(
          filtered_projects,
          this.getNames(),
          names
        );
      }
      if (labels && labels.length) {
        filtered_projects = applyLabelsFilter(
          filtered_projects,
          this.getLabels(),
          labels
        );
      }
      if (tags && tags.length) {
        filtered_projects = applyTagsFilter(
          filtered_projects,
          this.getTags(),
          tags
        );
      }
      return filtered_projects;
    };

    this.getTags = function() {
      return _.sortBy(tagsMap, function(entry) {
        return entry.name.toLowerCase();
      });
    };

    this.getNames = function() {
      return _.sortBy(namesMap, function(entry) {
        return entry.name.toLowerCase();
      });
    };

    this.getLabels = function() {
      return _.sortBy(labelsMap, function(entry) {
        return entry.name.toLowerCase();
      });
    };

    this.getPopularTags = function(popularTagCount) {
      return _.take(_.values(tagsMap), popularTagCount || 10);
    };
  };

  host.ProjectsService = ProjectsService;
})(window, _);
