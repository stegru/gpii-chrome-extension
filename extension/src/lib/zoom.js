/*
 * GPII Chrome Extension for Google Chrome
 *
 * Copyright 2016 RtF-US
 *
 * Licensed under the New BSD license. You may not use this file except in
 * compliance with this license.
 *
 * You may obtain a copy of the license at
 * https://github.com/GPII/gpii-chrome-extension/blob/master/LICENSE.txt
 */

/* eslint-env node */
/* global fluid, require */

"use strict";

var gpii = fluid.registerNamespace("gpii");
var chrome = chrome || fluid.require("sinon-chrome", require, "chrome");

fluid.defaults("gpii.chrome.zoom", {
    gradeNames: ["fluid.modelComponent", "gpii.chrome.eventedComponent"],
    model: {
        magnifierEnabled: false,
        magnification: 1
    },
    events: {
        onError: null,
        onTabOpened: null,
        onTabUpdated: null,
        onWindowFocusChanged: null,
        onZoomChange: null
    },
    eventRelayMap: {
        "chrome.tabs.onCreated": "onTabOpened",
        "chrome.tabs.onUpdated": "onTabUpdated",
        "chrome.tabs.onZoomChange": "onZoomChange",
        "chrome.windows.onFocusChanged": "onWindowFocusChanged"
    },
    invokers: {
        applyZoomSettings: {
            funcName: "gpii.chrome.zoom.applyZoomSettings",
            args: "{that}"
        },
        applyZoomInTab: {
            funcName: "gpii.chrome.zoom.applyZoomInTab",
            args: ["{that}", "{arguments}.0", "{arguments}.1"]
        },
        updateTab: {
            funcName: "gpii.chrome.zoom.updateTab",
            args: ["{that}", "{arguments}.0"]
        },
        zoomChanged: {
            funcName: "gpii.chrome.zoom.zoomChanged",
            args: ["{that}", "{arguments}.0"]
        }
    },
    modelListeners: {
        "zoom.modelChanged": {
            path: ["magnifierEnabled", "magnification"],
            funcName: "{that}.applyZoomSettings"
        }
    },
    listeners: {
        "onTabOpened.setupTab": {
            funcName: "{that}.updateTab",
            args: "{arguments}.0"
        },
        "onTabUpdated.setupTab": {
            funcName: "{that}.updateTab",
            args: "{arguments}.2"
        },
        "onZoomChange": {
            funcName: "{that}.zoomChanged",
            args: "{arguments}.0"
        },
        "onWindowFocusChanged.applyZoomSettings": "{that}.applyZoomSettings"
    },
    members: {
        tabOverride: {}
    }
});

gpii.chrome.zoom.applyZoomInTab = function (that, tab, value) {
    // set the zoom value if it hasn't already been set.
    chrome.tabs.getZoom(tab.id, function (currentZoom) {
        var newValue = gpii.chrome.zoom.getTabZoom(that, tab.id, value);
        if (currentZoom !== newValue) {
            chrome.tabs.setZoom(tab.id, newValue, function () {
                if (chrome.runtime.lastError) {
                    fluid.log("Could not apply zoom in tab'",
                              tab.url, "', error was: ",
                              chrome.runtime.lastError.message);
                    that.events.onError.fire(chrome.runtime.lastError);
                }
            });
        }
    });
};

gpii.chrome.zoom.applyZoomSettings = function (that) {
    var value = that.model.magnifierEnabled ? that.model.magnification : 1;
    // Iterate over all tabs in the current window and set the zoom factor
    // Only changing in the current window to address cases where changing the
    // zoom level in other windows causes it to gain focus. See: https://issues.gpii.net/browse/GPII-2525
    chrome.tabs.query({currentWindow: true}, function (tabs) {
        fluid.each(tabs, function (tab) {
            that.applyZoomInTab(tab, value);
        });
    });
};

gpii.chrome.zoom.updateTab = function (that, tab) {
    var value = that.model.magnifierEnabled ? that.model.magnification : 1;
    that.applyZoomInTab(tab, value);
};

gpii.chrome.zoom.zoomChanged = function (that, zoomChange) {
    // If the tab's new zoom level is different to what it should be, it must have been set by the user. Store the
    // difference so it can be used when the extension adjusts the tab's zoom.
    if (zoomChange.newZoomFactor !== gpii.chrome.zoom.getTabZoom(that, zoomChange.tabId)) {
        that.tabOverride[zoomChange.tabId] = zoomChange.newZoomFactor - that.model.magnification;
    }
};

// Gets the zoom level for the given tab, taking into account any user-given adjustment.
gpii.chrome.zoom.getTabZoom = function (that, tabId, newValue) {
    var baseValue = that.model.magnifierEnabled ? (newValue || that.model.magnification) : 1;
    var tabOverride = that.tabOverride[tabId] || 0;
    return baseValue + tabOverride;
};
