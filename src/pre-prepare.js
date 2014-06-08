/**
  Licensed to the Apache Software Foundation (ASF) under one
  or more contributor license agreements.  See the NOTICE file
  distributed with this work for additional information
  regarding copyright ownership.  The ASF licenses this file
  to you under the Apache License, Version 2.0 (the
  "License"); you may not use this file except in compliance
  with the License.  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing,
  software distributed under the License is distributed on an
  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
  KIND, either express or implied.  See the License for the
  specific language governing permissions and limitations
  under the License.
 */

var cordova = require('cordova');
var Q = require('q');
var fs = require('fs');
var et = require('elementtree');

// Returns a promise.
module.exports = exports = function prePrepareCommand() {
  var plugins = [];
  var manifest, whitelist;

  // Pre-prepare manifest check and project munger
  return require('./get-manifest')('www')
  .then(function(m) {
    manifest = m;
    return Q.when(require('./parse_manifest')(manifest));
  }).then(function(manifestData) {
    plugins = require('./plugin_map').DEFAULT_PLUGINS.concat(manifestData.plugins);
    whitelist = manifestData.whitelist;
    console.log('## Updating config.xml from manifest.json');
    return Q.ninvoke(fs, 'readFile', 'config.xml', {encoding: 'utf-8'});
  }).then(function(data) {
    var tree = et.parse(data);

    var widget = tree.getroot();
    if (widget.tag == 'widget') {
      widget.attrib.version = manifest.version;
      widget.attrib.id = manifest.packageId;
    }

    var name = tree.find('./name');
    if (name) name.text = manifest.name;

    var description = tree.find('./description');
    if (description) description.text = manifest.description;

    var author = tree.find('./author');
    if (author) author.text = manifest.author;

    var content = tree.find('./content');
    if (content) content.attrib.src = "plugins/org.chromium.bootstrap/chromeapp.html";

    var access;
    while ((access = widget.find('./access'))) {
      widget.remove(access);
    }
    whitelist.forEach(function(pattern, index) {
      var tag = et.SubElement(widget, 'access');
      tag.attrib.origin = pattern;
    });

    var configfile = et.tostring(tree.getroot(), {indent: 4});
    return Q.ninvoke(fs, 'writeFile', 'config.xml', configfile, { encoding: 'utf-8' });
  })

  // Install plugins
  .then(function() {
    cordova.off('results', console.log); // Hack :(.
    cordova.raw.plugin('ls').then(function(installedPlugins) {
      cordova.on('results', console.log);
      var missingPlugins = plugins.filter(function(p) {
        return installedPlugins.indexOf(p) == -1;
      });
      if (missingPlugins.length) {
        console.log('## Adding in new plugins based on manifest.json');
        var cmds = missingPlugins.map(function(pluginPath) {
          return ['plugin', 'add', pluginPath];
        });
        return require('./cordova-commands').runAllCmds(cmds);
      }
    }, function() {
      console.log = oldLog;
    });
  })

  // If chrome.identity is installed, we need a client id.
  .then(function() {
    cordova.raw.plugin('ls').then(function(installedPlugins) {
      if (installedPlugins.indexOf('org.chromium.identity') >= 0) {
        if (!manifest.oauth2 || !manifest.oauth2.client_id) {
          console.warn('Warning: chrome.identity requires a client ID to be specified in the manifest.');
        }
      }
    });
  });
};