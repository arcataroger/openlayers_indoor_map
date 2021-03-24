# openlayers_indoor_map
Example of an interactive, indoor museum map built by the [Field Museum](https://github.com/fieldmuseum) using OpenLayers 6.5 and QGIS 3.16.

This is an alpha release, meant more as an example of how to use OpenLayers to do indoor venue mapping. It's far from a complete project, and the codebase is messy and ugly. We hope to clean it up more and more over time, but in the meantime, at least it mostly works...

Please note that you're welcome to fork and use this code, but support will be limited. We're a small team with only one developer, and while we'll try to monitor and reply to issues, we can't promise the timely release of bugfixes or new features. 

Thanks for checking this out :)

# FEATURES
* Different levels of detail depending on zoom, to preserve visual hierarchy and emphasize major exhibitions and important amenities (restrooms) while zoomed in. Minor exhibitions start to appear once you zoom in more.
* Clickable points of interest (labels, areas, pictograms) that pop up a sidebar with more information (picture, link, description). The map also zooms to the clicked POI, and if it's an exhibition/area, highlights that using a slightly desaturated version of its brand color
* Permalinks for areas (not yet for pictograms) so that clicked POIs can be shared/bookmarked.
* Integration with a CMS (Contentful) so non-developer editors can make changes to exhibition text, pictures, colors, and also open/close them depending on COVID social distancing rules or other reasons
* COVID one-way flows drawn as polylines, with automatic start/end styles (circle and arrowhead)
* Some icon or text sizes remain constant at certain zoom levels to ensure readability.
* Automatic thumbnail generation (for the sidebar) using cloud image APIs (Drupal and Cloudinary)


## Mobile-specific features
* Mobile-friendly UI
* Sidebar becomes a bottom popover
* Different initial viewport focused on the entrance instead of a whole floor

# VISITOR (END-USER) INSTRUCTIONS
We hope our map is intuitively usable by visitors already familiar with Google Maps or Apple Maps, though we don't have the data to prove this. In time, we hope to add more real user monitoring and in-app analytics.

Basic interactions are provided by OpenLayers by default and used like any other web map (panning, zooming, etc.)

In addition, visitors can:
* Zoom in and out to see varying levels of detail (minor exhibitions, etc)
* Click on specific exhibitions or labels to open a slide-in panel with a basic description, and a link out for more info
* Use permalinks to access a specific floor and/or exhibition

## Keyboard shortcuts
These are currently undocumented in the UI because most of our visitors are on mobile anyway. We just added these for our own convenience.

* -/+ - Zoom in/out
* ESC - Close the sidebar
* 1/2/3 - Switch floors

# DEVELOPER INSTRUCTIONS

## Installation
* Clone the repo from Github
* To spin up a dev server, use `npm start`. This will use Parcel to build a dev environment and start a dev server at `localhost:1234`.  This should also enable autoreload, so editing code or CSS (anything that Parcel sees) should cause the page to automatically refresh
* To publish for production, use `npm build`. The built output should be in `/docs`. We use `docs` for Github Pages compatibility; you can reconfigure the output directory by editing `/package.json`.

## Folder structure & assets
```
index.js - The main app, containing all the custom code we built
index.css - Styling for the UI (buttons, logo, etc.)

assets/ - Source files for our assets
  cms/ - Content (colors, descriptions, links, etc.) for our points of interest. A JSON dump from Contentful.
  icons/ - SVG icons used for amenities and pictograms
  images/ - UI images used in index.html
  layers/ - Floor source files (tif, png), outputs (geoJSON), and QGIS project

docs/ - The built and minified production files from 'npm build'. This is what you serve to the public on a real webhost.

.idea/ - Ignore this. It's project-specific configuration used by our IDE, PHPStorm. 
```
* We've provided our assets (layer geoJSONs, SVG icons, etc.) as Creative Commons-licensed examples, excluding webfonts that we don't have permission to redistribute. Feel free to use these while you're experimenting with the map, but obviously you'll want to use your own assets once you've built them.
* We created all our floor layers in QGIS (also FOSS) and exported them as geoJSON files for OpenLayers. The process of converting PDF maps or CAD files into usable geoJSON layers is out of scope of this readme, but in brief, it consists of georeferencing your PDF, using that as a tracing layer, and building vector features on top of it. We've included `/assets/layers/qgis-project.qgz` as an example so you can see how this was done, and there are numerous tutorials online and on YouTube. At some point we hope to record a video tutorial of our own showing how we did this; if that would be helpful, please let us know.

##  Basic Workflow 
1. Create vector layers in your GIS software for footprints (polygons), areas of interest (polygons), one-way flows (polylines), labels (points), amenities (points), etc.
1. Export or save those layers as geoJSON, making sure to [save their feature IDs in a geoJSON compatible way](https://gis.stackexchange.com/a/383629/12167) (by default QGIS will export IDs inside `properties{}`, which will NOT work)
1. Load the geoJSON sources into `LayerFiles{}`, configure them in `LayerSettings{}`, style them by layer type in `LayerStyles{}`, group them into floors in `Floors{}`
1. Create the map with `tfmMap` and view with `tfmView`. The map is the parent OpenLayers object that controls and draws everything. The view controls the human-visible viewport, along with zoom and rotation constraints.
1. Use `ol-layerswitcher` to handle switching between floors (layer groups)
1. Use interaction events (in our case, `tfmMap.on('click')`) and plain Javascript logic to handle clicks on different types of features, e.g. an area itself or the label associated (by ID) to that area.
1. Use various helper functions to provide quality-of-life benefits for the end-user (visitor), such as opening/closing the sidebar, producing thumbnails out of bigger pictures, handling permalinks, basic keyboard shortcuts

## Configuring the code
Apologies in advance: This project was built in a hurry, with only one developer, and we did not create the codebase in a very modular manner. Configuration parameters are spread all throughout `index.js`, though the majority are near the top. We hope to clean this up and refactor it into proper modules and files at a later point. In the meantime, here's the most important configurations to keep track of in `index.js`:

* Styling for map features: OpenLayers does not use CSS to control features on the actual canvas. Instead, the look and feel of all our layers an features are defined in the LayerStyles{} object.
* Point of interest content: Although geometries are hardcoded in the geoJSONs, we opted for a CMS for other POI content, such as titles, descriptions, links, images, etc. Data from that CMS is loaded into the `contentfulData{}` object. We chose to use Contentful for this project, but you can replace it with any other CMS you like (Drupal, Wordpress with Advanced Custom Forms, Airtable, Google Sheets... anything that can give you a JSON with IDs to work with). Or if you want to skip a CMS and hardcode it all into a JSON file, that's what we did with `fallback-data.json` (which is our local cache of Contentful's API output; we use this to ensure the map loads even if Contentful is unreachable, albeit that will result in slightly stagnant data).
* Layers: OpenLayers has a somewhat convoluted layer loading mechanism. First we use Parcel to `require` geoJSON files into the `LayerFiles{}` object, then loop through that to populate the actual `LayerSources{}` object using the OpenLayers API and a simple forEach loop. `LayerSources{}`. These sources are configured in `LayerSettings{}` and styled in `LayerStyles{}`. Phew! Messy, ain't it?
* Floors: A **layer** is a set of geoJSON features, configured by you, that OpenLayers renders. A **floor** is a mental construct we've made up for our visitors, consisting of one or more grouped layers (the floor footprint, exhibition areas, COVID one-way flows, amenities, labels, decorative pictograms, etc.). In our case, the specific layer configuration for each floor is set up in the `Floors{}` object, which brings together all the layers, settings, and styles for each floor.
* Various `tfmXXXXX{}` constants like `tfmZooms{}` or `tfmIcons{}`: These are really just for our convenience. Most are self-explanatory. Of particular note is `tfmIcons{}`, which loads in a bunch of SVGs using Parcel's `require`. This is a quirk of our particular toolchain; if you were using webpack or something else, you might be able to load in these SVGs another way (e.g. with `import`).
* `layerSwitcher` options: We use [ol-layerwitcher](https://github.com/walkermatt/ol-layerswitcher#api) to switch between floors (layer groups). Currently, users can deselect all the floors by clicking the same floor twice; we hope to address this with [this eventual patch](https://github.com/walkermatt/ol-layerswitcher/pull/360).
* Feature `closed` status: We use this in several layer types in order to indicate whether an exhibition is open to the public as normal (`closed='Open' or 0`), temporarily closed due to COVID (`closed='Closed' or 1`), or restricted to staff and never open to the public (`closed='Staff-Only' or 2`). We realize this numbering scheme is inconsistent, and that's something we hope to clean up in the future. You might see some orphaned styling code (commented out) where the temporarily closed areas can be displayed as diagonal gray lines instead of solid gray fill; we opted against that in the released version to maintain visual simplicity.
  
## How user interactions are handled (e.g. clicking on an exhibition)
* OpenLayers handles the basics: zooming, panning, catching clicks, etc. 
* The click handler (`tfmMap.on('click', e=>{})`) near line 727 does the rest of the magic. The basic logic is:
  *  When a click is detected, first check it against a filter function in the `layerFilter` parameter of the click handler. In our case only layers marked as `tfmClickable=true` in their `LayerSettings{}` template will be considered clickable. In our case, that's labels (text and padding), pictograms (their SVG fills), and areas (geoJSON polygons). OpenLayers is pretty good at evaluating where the click actually happened, though it does struggle a bit with more complex, layered SVG files (which only matters for the pictograms). Our setup is a bit more complex than yours might be, because our branded print map design forced our hand in doing something similar for our exhibitions, giving them labels in addition to their polygonal areas. These labels are defined in another point layer (e.g. upper_area_labels.geojson) and formatted using OpenLayers. They are intended to be the main clickable things on the map, though users can also choose to click on an area if they so choose.
  ** Once a click is detected, we only want the topmost feature from `forEachFeatureAtPixel()`. The reason we use that instead of OL's `selection` handler is due to an apparent bug that sometimes catches label clicks at the edges of padded text (our labels) to register right. We never got to the bottom of that, so we use `forEachFeatureAtPixel()` instead, but just the first hit
  *  The `switch(tfmLayerType)` statement examines the kind of layer it is (again set in `LayerSettings{}`) and proceeds accordingly. Ultimately, exhibitions are areas, and labels witch matching IDs go to those areas. **It's important to make sure your IDs are unique and consistent between the .geoJSONs for the area and label layers, and also in your CMS.**
  
## Helper functions

Documentation for these will come later. For the most part, they are self-explanatory or explained in the code comments... hopefully. If anything is confusing, please reach out.

# KNOWN ISSUES

## Big-picture caveats
* OpenLayers is generally intended for outdoor use and has no built-in support for indoor functions (floors, stairs, doors, hallways, etc.). What we've made is a hack at best, using overlapping vector layers grouped together to create the mere illusion of floors inside a building.
* Each feature addition/change takes a lot of manual labor. Adding a new clickable area, for example, requires multiple layer changes in QGIS (polygons for areas, points for labels, polylines for COVID-flows), tweaking the geoJSON exporter (to fix feature IDs), creating a new entry in your CMS, then finally setting it all up in OpenLayers (adding new layers or styles if necessary).
* The codebase is messy and far from elegant; apologies in advance. We were working with minimal resources, using a single developer with limited Javascript experience. We hope to clean it up and refactor the spaghetti code into proper classes and modules later.

## UX / Visitor-facing
* Rectangular map labels don't look clickable
* Labels can overlap one another and make text unreadable. The layer setting `declutter=true` can hide some when they overlap, but that's not desirable behavior either. OpenLayers doesn't seem to have a "rearrange labels so they don't overlap" feature the way ArcMap or QGIS do
* `ol-layer-switcher` (the package we use for the floor switcher buttons) doesn't allow mutually exclusive layer groups (i.e. floors consisting of multiple layers) to be toggled as radio buttons. They are instead checkboxes styled to look like buttons, but clicking on one that's already selected will "uncheck" it and cause all the layer to disappear, resulting in no floor being visible.

## Accessibility
* In general, the map can only be used by sighted users able to interact by touch. Accessible navigation needs to be provided by other means, such as audio guides, docents, or textual turn-by-turn directions (on the wishlist, but work has not yet started)
* Working with a limited brand color palette, many POIs are difficult to distinguish for visitors with color deficiencies
* Very limited keyboard support

## Package vulnerabilities (false positive)
* Ignore the parcel-bundler/node-forge vulnerability, see https://github.com/parcel-bundler/parcel/issues/5145

## Exporting from QGIS
* If you save feature IDs from QGIS fields, they must be converted into geoJSON-compatible IDs using JQ or a similar tool, e.g. `for file in *.geojson; do jq '(.features[] | select(.properties.id != null)) |= (.id = .properties.id)' $file > "$file"_tmp; mv "$file"_tmp $file;done`. This is because QGIS saves feature IDs as properties (see https://github.com/qgis/QGIS/issues/40876).

## CMS (Contentful)
* We match features to our CMS based on their ID. It's a lookup between the geoJSON `id` member and the Contentful entry id, which is also the last part of an entry's URL. However, you can only specific this ID via the Contentful Content Management API, NOT via the Contentful website. If you try to add a new entry on the website, it will get a random UUID as its entry ID and OpenLayers won't be able to find it. In hindsight we should've used a separate field in Contentful to match entries.
* Contentful seemed a bit overkill for this. Probably a rudimentary CMS built in Airtable or even Google Sheets, with their respective JSON APIs, would've been fine. We were mainly trialing Contentful for a subsequent project, and this was an easy way to test it. We walked away with mixed impressions.


## Pictograms / SVGs
* SVG widths/heights must be explicitly defined in the SVG files themselves. Illustrator doesn't do this by default
* Scaling them up using the OpenLayers `scale` property causes aliasing. It appears OpenLayers is rendering to canvas first and then resizing, rather than using a high-res vector to scale. To work around this, we often start with a bigger-than-intended SVG declared size and then scale down from there.

## Misc technical / behind the scenes
* The floor switcher uses its own code to hide/show floors, instead of `switchFloors()`. `ol-layer-switcher` doesn't have any hooks/events we can tie into. 
* We manipulate the DOM directly, such as for updating the sidebar. We opted not to use React or similar in order to minimize the download size for users who already have to grab a lot of assets (layers, pictures, fonts, etc.).
