// Turn on debug mode during local development based on hostname
// Or when a query param "debug" is set (for CMS content previews)
const queryString = new URLSearchParams(window.location.search);
const hasDebugParam = queryString.has('debug');
if (window.location.hostname === 'localhost' || window.location.hostname === 'tfm-map-preview.vercel.app' || hasDebugParam) window.tfmDebug = true;

/*** BASIC SETUP ***/
// OpenLayer modules
import {Map, View} from 'ol';
import LayerSwitcher from 'ol-layerswitcher';
import GeoJSON from 'ol/format/GeoJSON';
import {Vector as VectorSource, OSM} from 'ol/source';
import {Tile as TileLayer, Vector as VectorLayer, Group as LayerGroup} from 'ol/layer';
import {Fill, Stroke, Style, Text, Icon, Circle, RegularShape} from 'ol/style';
import Point from 'ol/geom/Point';
import {defaults as defaultInteractions} from 'ol/interaction';

/*
 Contentful SDK
 Contentful is our CMS for most of the map metadata content (colors, descriptions, full names, etc.)
 Currently, some non-clickable exhibition labels are hardcoded in the geoJSON layers directly
 But as soon as something becomes interactive or needs editor configuration, it goes into Contentful
 You can swap out Contentful for any other headless CMS of your choice. We tried this with Airtable, GSheets, etc.
 To do so, you will have to either mirror Contentful's API structure or else refactor the data structures in this file
 Sorry for our lack of abstraction!
*/

import "regenerator-runtime/runtime"; // Contentful needs it
import * as contentful from 'contentful'; // Basic JS SDK
import {documentToHtmlString} from '@contentful/rich-text-html-renderer'; // Renders Contentful's WYSIWYG rich text fields

// Stylesheets
import 'ol/ol.css'; // Some default OpenLayer styles
// index.css contains OUR styles. That's loaded via index.html instead (don't ask me why; just how OL set it up)


/*** PRELOAD CONTENT DATA ***/
// First we preload the data from a cached JSON file, for faster loading and just in case our CMS is down
import FallbackData from '/assets/cms/fallback-data.json';
let CMSData = {};
FallbackData.items.forEach(item => {
    CMSData[item.sys.id] = item;
});

/*** REFRESH DATA FROM CMS ***/
// Disabled for the open-source release, but uncomment and it should work

/*
// Then we set up a fetch from our CMS, Contentful
// We default to the production build (i.e., entries marked PUBLISHED)
let client = contentful.createClient({
    space: 'your_space_id', // The ID for your Contentful space
    accessToken: 'your_api_token' // You'd want to set your own API key. SUE is ours!!
})

// But if debug mode is on, we fetch from the preview build instead
// This shows unpublished drafts so we can see how color changes, etc. will look without affecting visitors
if(window.tfmDebug) {
    client = contentful.createClient({
        host: 'preview.contentful.com', // To see unpublished changes
        space: 'your_same_space_id', // The ID for your Contentful space
        accessToken: 'your_PREVIEW_api_token' // Preview API key is different from regular key
    })

}

client.getEntries({
    content_type: 'poi',
}).then((response) => {
    CMSData = {}; // Clear the fallback

    // Replace it with Contentful's data
    response.items.forEach(responseItem => {
        CMSData[responseItem.sys.id] = responseItem;
    });
}).catch(console.warn)

*/

/*** REUSABLE SETTINGS ***/

/*
 We show/hide different things depending on zoom level
 For example, important exhibitions and amenities (restrooms, etc.) are always visible,
 while others only appear at `medium` or `close`.

 Independently of zoom levels, some font and icon sizes scale as a function of the zoom level.
 This is so that they can remain constant sized to the visitor, i.e. as zoom level increases, their size decreases
 proportionally so that they remain the same on-screen size.
 */
const tfmZooms = {
    far: 17,
    medium: 18.5,
    close: 20,
};

// Our brand colors. Our CMS uses these same string names in `fields.color`
const tfmColors = {
    "Field Blue": '#0a46e6',
    "Field Gray Lighter": '#F0F3F3',
    "Field Gray Light": '#C9CACC',
    "Field Gray": '#6a6a71',
    "Field Gray Darker": '#333336',
    "Field Black": '#0F0F14',
    "Field Orange": '#F29F77',
    "Field Purple": '#B274A7',
    "Field Green": '#37816e',
    "Success Green": '#53B59E',
    "Warning Red": '#D44235',
    "Map Dark Yellow": '#9a7e0b',
    "Map Brown": '#663300',
    "Map Light Blue": '#6FB4D6',
    "Map Yellow": '#C6AD59',
    "Map Magenta": '#A7197C',
    "Map Light Green": '#AAC38A',
    'Error Red': '#FF0000',
};

// Line widths
const tfmStrokes = {
    narrow: 1, // Most lines (we use a minimalist style)
    thick: 4, // COVID one-way flows
}

/*** LAYER SETUP ***/

// First read in the files
// Note that the `require()` function here is provided by our packer, Parcel, not OL or JS
// We do this because geoJSON files aren't ES6 modules and can't be properly `import()`ed.


// !!! SUPER IMPORTANT!!!
// Note that if you're editing these with QGIS, there's a bug that prevents saving geoJSON IDs properly
// QGIS saves IDs as inside `properties`, when the geoJSON spec says they should instead be a top-level member
// See https://github.com/qgis/QGIS/issues/40805 for details
// For now, the workaround is documented in that Github issue, or you can manually move IDs in the geoJSONs
// The IDs are used anywhere the OpenLayer `getId()` function is used, which is a lot of places.

const LayerFiles = {
    ground: {
        areas: require('/assets/layers/ground_level_areas.geojson'),
        labels: require('/assets/layers/ground_level_labels.geojson'),
        amenities: require('/assets/layers/ground_level_amenities.geojson'),
        flows: require('/assets/layers/ground_level_flows.geojson'),
        pictograms: require('/assets/layers/ground_level_pictograms.geojson'),
        outline: require('/assets/layers/ground_level_outline.geojson'),
    },
    main: {
        areas: require('/assets/layers/main_level_areas.geojson'),
        labels: require('/assets/layers/main_level_labels.geojson'),
        amenities: require('/assets/layers/main_level_amenities.geojson'),
        flows: require('/assets/layers/main_level_flows.geojson'),
        pictograms: require('/assets/layers/main_level_pictograms.geojson'),
        outline: require('/assets/layers/main_level_outline.geojson'),
    },
    upper: {
        areas: require('/assets/layers/upper_level_areas.geojson'),
        labels: require('/assets/layers/upper_level_labels.geojson'),
        amenities: require('/assets/layers/upper_level_amenities.geojson'),
        flows: require('/assets/layers/upper_level_flows.geojson'),
        pictograms: require('/assets/layers/upper_level_pictograms.geojson'),
        outline: require('/assets/layers/upper_level_outline.geojson')
    }
}

// Then load them into OpenLayer VectorSources
// In OpenLayers, each layer is a combination of both a geometry source (the VectorSource) and other data (styles, etc.)
const LayerSources = {};
Object.entries(LayerFiles).forEach(([floor, layers]) => {
    LayerSources[floor] = {};
    Object.entries(layers).forEach(([layerName, layer]) => {
        LayerSources[floor][layerName] = new VectorSource({
            url: layer,
            format: new GeoJSON(),
        })
    })
});

// Defining reusable layer styles shared by all the layers of the same type (exhibition areas, amenity icons, etc.)
// They get used and assigned to particular layers in the next section, LayerSettings{}
const LayerStyles = {
    // This is a hack to get around an issue with ol-layerswitcher: because our floor switcher "buttons" are actually
    // checkboxes, it's possible to unselect ALL of them and be left with nothing visible on the map.
    // In that case, this layer shows up and tells visitors to choose a floor.
    WarningLayer: [
        new Style({
            fill: new Fill({
                color: 'white',
            }),
            // https://openlayers.org/en/latest/apidoc/module-ol_style_Text-Text.html
            text: new Text({
                text: "Oops! You've unselected all the floors.\nPlease choose a floor to get back into the museum.\n\nPsst... did you know that TFM Members can go deep underground\n to see secret collections during Members' Nights?",
                font: '10pt Graphik, sans-serif',
                fill: new Fill({color: 'black'}),
                overflow: false,
            }),
        }),
    ],

    // When you zoom out far enough, we replace the museum internals with just our name and a message to zoom further in
    ZoomedOutFootprint: [
        new Style({
            fill: new Fill({
                color: tfmColors['Field Blue'],
            }),
            stroke: new Stroke({
                color: tfmColors['Field Blue'],
                width: 3,
            }),
            // https://openlayers.org/en/latest/apidoc/module-ol_style_Text-Text.html
            text: new Text({
                text: "FIELD MUSEUM     ",
                font: 'bold 16pt Druk, sans-serif',
                fill: new Fill({color: 'white'}),
                overflow: false,
            }),
        }),
        new Style({
            // https://openlayers.org/en/latest/apidoc/module-ol_style_Text-Text.html
            text: new Text({
                text: "(zoom in)     ",
                offsetY: 15,
                font: '8pt Graphik, sans-serif',
                fill: new Fill({color: 'white'}),
                overflow: false,
            }),
        })
    ],

    // Amenity icons
    // `showAtFarZoom` is the list of amenity IDs (set in geoJSON) that will show up at the `far` zoom level
    // Others show up at `medium` and in
    // You can set zoom levels in the Reusable Settings section, near the top of this file
    amenities: feature => {
        const showAtFarZoom = ['elevator', 'stairs_up', 'stairs_up_down', 'stairs_down', 'restroom', 'restroom_male', 'restroom_female'];
        const important = showAtFarZoom.includes(feature.get('type'));
        if (!important && tfmView.getZoom() < tfmZooms.medium) return;

        return new Style({
            image: new Icon({
                src: tfmIcons[feature.get('type')],
                color: 'white',
                scale: important ? (tfmView.getZoom() < tfmZooms.close ? 0.05 : 0.01 / tfmView.getResolution()) : 0.01 / tfmView.getResolution(),
                opacity: important ? 1 : (0.1 / tfmView.getResolution()) + 0.25

            }),
        })
    },


    // Animal glyphs (dinosaurs, lions, and birds, oh my)
    pictograms: feature => {
        const id = feature.getId();
        const coords = feature.getGeometry().getCoordinates();
        const deskew = angle => (angle + 0.95) * Math.PI / 180; // To account for Chicago skewing off true north
        const directions = {
            north: deskew(0),
            east: deskew(90),
            south: deskew(180),
            west: deskew(270),
        };

        switch (id) {

            // North entrance
            case 'north_entrance':
                return new Style({
                    geometry: new Point(coords),
                    image: new RegularShape({
                        fill: new Fill({color: tfmColors["Field Gray"]}),
                        points: 3,
                        radius: 2 / tfmView.getResolution(),
                        angle: directions.north,
                    }),

                    text: new Text({
                        fill: new Fill({color: tfmColors["Field Gray"]}),
                        font: 1.5 / tfmView.getResolution() + 'pt Graphik, sans-serif',
                        text: 'Exit Only\n(Enter on ground Floor)',
                        offsetY: -5 / tfmView.getResolution(),
                    })

                })

            case 'south_entrance':
                return new Style({
                    geometry: new Point(coords),
                    image: new RegularShape({
                        fill: new Fill({color: tfmColors["Field Gray"]}),
                        points: 3,
                        radius: 2 / tfmView.getResolution(),
                        angle: directions.south,
                    }),

                    text: new Text({
                        fill: new Fill({color: tfmColors["Field Gray"]}),
                        font: 1.5 / tfmView.getResolution() + 'pt Graphik, sans-serif',
                        text: 'Exit Only\n(Enter on ground Floor)',
                        offsetY: 5 / tfmView.getResolution(),
                    })

                })

            case 'east_entrance':
                return new Style({
                    geometry: new Point(coords),
                    image: new RegularShape({
                        fill: new Fill({color: tfmColors["Field Blue"]}),
                        points: 3,
                        radius: 4 / tfmView.getResolution(),
                        angle: directions.west,
                    }),

                    text: new Text({
                        fill: new Fill({color: tfmColors["Field Blue"]}),
                        font: 'bold ' + 6 / tfmView.getResolution() + 'pt Graphik, sans-serif',
                        text: 'Entrance',
                        textAlign: 'right',
                        offsetX: -5 / tfmView.getResolution(),
                    })

                })

            default:
                if (tfmView.getZoom() < tfmZooms.medium) return;

                return new Style({
                    image: new Icon({
                        src: tfmPictograms[id],
                        color: 'white',
                        scale: tfmView.getZoom() < tfmZooms.close ? 0.1 / tfmView.getResolution() : 0.68,
                        opacity: (0.1 / tfmView.getResolution()) + 0.25
                    }),
                })
        }
    },
    // COVID one-way flow arrows
    flows: feature => {
        if (tfmView.getZoom() < tfmZooms.medium) return;
        if (CMSData[feature.get('exhibition')].fields.closed === 'Closed' || CMSData[feature.get('exhibition')].fields.closed === 'Staff-Only') return;
        const coords = feature.getGeometry().getCoordinates()[0]; // Returns an array of coordinate pairs
        const endPoint = coords[coords.length - 1];
        const startPoint = coords[0];
        const secondToLastPoint = coords[coords.length - 2];

        // Calculating a rotation angle from two coordinate pairs:
        // https://gist.github.com/conorbuck/2606166
        const rotationAngle = Math.atan2(endPoint[0] - secondToLastPoint[0], endPoint[1] - secondToLastPoint[1]);

        let color;
        try {
            color = tfmColors[CMSData[feature.get('exhibition')].fields.color];
        } catch (e) {
            if (window.tfmDebug) console.warn(`Flow for exhibition ${feature.get('exhibition')} has no color, falling back to red.`, e, feature);
            color = tfmColors['Error Red'];
        }

        return [
            new Style({
                stroke: new Stroke({
                    color: 'white',
                    width: 3 / tfmView.getResolution(),
                    lineJoin: 'miter',
                })
            }),
            new Style({
                stroke: new Stroke({
                    color: color,
                    width: 1.5 / tfmView.getResolution(),
                    lineJoin: 'miter',
                })
            }),
            new Style({
                geometry: new Point(startPoint),
                image: new Circle({
                    fill: new Fill({color: color}),
                    radius: 2 / tfmView.getResolution(),
                })
            }),
            new Style({
                geometry: new Point(endPoint),
                image: new RegularShape({
                    fill: new Fill({color: color}),
                    points: 3,
                    radius: 3 / tfmView.getResolution(),
                    angle: rotationAngle,
                })
            }),
        ];
    },

    // Major exhibition labels
    labels: feature => {
        const labelData = CMSData[feature.getId()] ? CMSData[feature.getId()].fields : undefined;
        if (!labelData) return; // Don't show this label unless it's explicitly added to our CMS
        if (!labelData.closed || labelData.closed === 'Closed' || labelData.closed === 'Staff-Only') return; // Don't show if closed or if the field was never set
        if (labelData.showAtZoomLevel === 'medium' && tfmView.getZoom() < tfmZooms.medium) return; // Don't show if below set zoom level

        const name = labelData.labelOverride ?? labelData.shortName;
        let color = tfmColors[labelData.color] ?? tfmColors['Error Red']; // Fallback color

        /*// Fade out unselected labels for easier ID when one is clicked on
        // TOOD: Fix bugginess
        if (selectedFeature && selectedFeature.getId() !== feature.getId()) color = tfmColors['Field Gray Light'];
    */
        const fontSize = tfmView.getZoom() < tfmZooms.close ? 10 : 1.5 / tfmView.getResolution();
        const labelWidth = tfmView.getZoom() < tfmZooms.close ? 20 : 3 / tfmView.getResolution();
        const labelHeight = tfmView.getZoom() < tfmZooms.close ? 8 : 1 / tfmView.getResolution();
        return new Style({
            // Text parameters: https://openlayers.org/en/latest/apidoc/module-ol_style_Text-Text.html
            text: new Text({
                text: name + ' »',
                font: 'bold ' + fontSize + 'pt Graphik, sans-serif',
                textAlign: labelData.labelAlignment ?? 'center',
                fill: new Fill({color: 'white'}),
                backgroundFill: new Fill({color: color}),
                padding: [labelHeight, labelWidth, labelHeight, labelWidth],
                overflow: true, // Allow labels to exceed polygon width (or they'd just be hidden)
            }),
        })
    },
    Footprint: new Style({
        fill: new Fill({
            color: 'white',
        }),
    }),
    outline: new Style({
        stroke: new Stroke({
            color: tfmColors["Field Gray"],
            width: tfmStrokes.narrow,
        }),
    }),

    // Areas (exhibition, staff-only, etc.)
    areas: feature => {
        let closed = feature.get('closed') ?? 0; // By default, use the feature's geoJSON "closed" property, or 0 (open) as a fallback

        // But if this feature is in our CMS, use that instead
        if (CMSData[feature.getId()]) {
            switch (CMSData[feature.getId()].fields.closed) {
                case 'Open': // Open to the public
                    closed = 0;
                    break;
                case 'Staff-Only': // Always closed to the public (staff areas, etc.)
                    closed = 2;
                    break;
                case 'Closed': // Temporarily closed due to COVID. We experimented with different styling but ultimately opted against it.
                    closed = 1;
                    break;
            }
        }

        switch (closed) {
            /*

            // Diagonal gray stripes (not currently used)
            // Previously used for areas temporarily closed due to COVID, but it became too visually confusing
            // So we just mark all closed areas with the same solid gray
            case 1:
                return new Style({
                    // https://viglino.github.io/ol-ext/doc/doc-pages/ol.style.FillPattern.html
                    fill: new FillPattern({
                        pattern: 'hatch',
                        size: tfmStrokes.narrow,
                        angle: 45,
                        color: tfmColors["Field Gray Light"],
                        scale: 0.5,
                    }),

                    stroke: new Stroke({
                        color: tfmColors["Field Gray Light"],
                        width: tfmStrokes.narrow,
                    }),
                })
    */
            // Solid gray (closed and staff areas)
            case 1:
            case 2:
                return new Style({
                    // https://viglino.github.io/ol-ext/doc/doc-pages/ol.style.FillPattern.html
                    fill: new Fill({
                        color: tfmColors["Field Gray Light"],
                    }),

                    stroke: new Stroke({
                        color: tfmColors["Field Gray Light"],
                        width: tfmStrokes.narrow,
                    }),
                    /*
                                    text: new Text({
                                        text: feature.get('label') ? (tfmView.getZoom() >= tfmZooms.close ? feature.get('label') + '\n(Closed)': null) : null,
                                        font: (tfmView.getZoom() >= tfmZooms.close ? 1.2 / tfmView.getResolution() : 8) + 'pt Graphik, sans-serif',
                                        fill: new Fill({
                                            color: tfmColors['Field Gray'],
                                        }),
                                        overflow: true,
                                        offsetY: 50,
                                    }),
                                    */
                })

            // Open (white background, gray label text if specified in the geoJSON)
            default:
                const color = CMSData[feature.getId()] ? tfmColors[CMSData[feature.getId()].fields.color] + '88' : 'white';

                return new Style({
                    stroke: new Stroke({
                        color: tfmColors["Field Gray Light"],
                        width: tfmStrokes.narrow,
                    }),

                    fill: new Fill({
                        color: 'white',
                    }),

                    text: new Text({
                        text: feature.get('label') ? (tfmView.getZoom() >= tfmZooms.medium ? feature.get('label') : '') : null,
                        font: (tfmView.getZoom() >= tfmZooms.close ? 1.2 / tfmView.getResolution() : 8) + 'pt Graphik, sans-serif',
                        fill: new Fill({
                            color: tfmColors['Field Gray'],
                        }),
                        overflow: true,
                        opacity: (0.1 / tfmView.getResolution()) + 0.25,
                    }),
                })
        }
    }
};

// Layer settings by layer type
// This is where we define the settings per layer type
const LayerSettings = {
    labels: {
        tfmClickable: true,
        tfmLayerType: "label",
        minZoom: tfmZooms.far,
        updateWhileInteracting: true,
        updateWhileAnimating: true,
        style: feature => LayerStyles.labels(feature),
    },
    pictograms: {
        minZoom: tfmZooms.far,
        tfmLayerType: "pictogram",
        tfmClickable: true,
        updateWhileInteracting: true,
        updateWhileAnimating: true,
        style: feature => LayerStyles.pictograms(feature),
    },
    flows: {
        minZoom: tfmZooms.far,
        updateWhileInteracting: true,
        updateWhileAnimating: true,
        style: feature => LayerStyles.flows(feature),
    },
    Footprint: {
        minZoom: tfmZooms.far,
        updateWhileInteracting: true,
        updateWhileAnimating: true,
        style: LayerStyles.Footprint
    },
    areas: {
        tfmClickable: true,
        tfmLayerType: "area",
        minZoom: tfmZooms.far,
        updateWhileInteracting: true,
        updateWhileAnimating: true,
        style: feature => LayerStyles.areas(feature),
    },
    outline: {
        minZoom: tfmZooms.far,
        updateWhileInteracting: true,
        updateWhileAnimating: true,
        style: LayerStyles.outline
    },
    amenities: {
        minZoom: tfmZooms.far,
        updateWhileInteracting: true,
        updateWhileAnimating: true,
        style: feature => LayerStyles.amenities(feature)
    },
};

/*
 This is where we actually initiate the layers, combining their sources and their settings (which also include their styles).

 A "floor" is a just a group of layers for a specific floor of the museum, but we group them for easy switching
 Each floor should at least have a solid footprint and areas, otherwise the base layer (OSM/Google Maps) will show through
 The other stuff (flows, labels, amenities, pictograms, etc.) are helpful for visitors but not strictly necessary if you want to disable them

 Once they are added here, they also automatically get added to the floor switcher based on `LayerGroups`. Setting a group's type to `base` will make them
 mutually exclusive (only one base can be selected at a time). This behavior is due to change in a future version of `ol-layerswitcher`.
*/
const Floors = {
    upper: new LayerGroup({
        title: 'Upper<br>Level',
        type: 'base',
        layers: [
            new VectorLayer({source: LayerSources.upper.outline, ...LayerSettings.Footprint}),
            new VectorLayer({source: LayerSources.upper.areas, ...LayerSettings.areas}),
            new VectorLayer({source: LayerSources.upper.outline, ...LayerSettings.outline}),
            new VectorLayer({source: LayerSources.upper.amenities, ...LayerSettings.amenities}),
            new VectorLayer({source: LayerSources.upper.flows, ...LayerSettings.flows}),
            new VectorLayer({source: LayerSources.upper.pictograms, ...LayerSettings.pictograms}),
            new VectorLayer({source: LayerSources.upper.labels, ...LayerSettings.labels}),
        ]
    }),

    main: new LayerGroup({
        title: 'Main<br>Level',
        type: 'base',
        layers: [
            new VectorLayer({source: LayerSources.main.outline, ...LayerSettings.Footprint}),
            new VectorLayer({source: LayerSources.main.areas, ...LayerSettings.areas}),
            new VectorLayer({source: LayerSources.main.outline, ...LayerSettings.outline}),
            new VectorLayer({source: LayerSources.main.amenities, ...LayerSettings.amenities}),
            new VectorLayer({source: LayerSources.main.flows, ...LayerSettings.flows}),
            new VectorLayer({source: LayerSources.main.pictograms, ...LayerSettings.pictograms}),
            new VectorLayer({source: LayerSources.main.labels, ...LayerSettings.labels}),
        ]
    }),

    ground: new LayerGroup({
        title: 'Ground<br>Level',
        type: 'base',
        layers: [
            new VectorLayer({source: LayerSources.ground.outline, ...LayerSettings.Footprint}),
            new VectorLayer({source: LayerSources.ground.areas, ...LayerSettings.areas}),
            new VectorLayer({source: LayerSources.ground.outline, ...LayerSettings.outline}),
            new VectorLayer({source: LayerSources.ground.amenities, ...LayerSettings.amenities}),
            new VectorLayer({source: LayerSources.ground.flows, ...LayerSettings.flows}),
            new VectorLayer({source: LayerSources.ground.pictograms, ...LayerSettings.pictograms}),
            new VectorLayer({source: LayerSources.ground.labels, ...LayerSettings.labels}),
        ]
    }),
};

// Amenity icons
// Note that the "require" functionality here comes from Parcel. If you were using webpack or another bundler, you may have to change this.
const tfmIcons = {
    atm: require('~/assets/icons/atm.svg'),
    picnic_area: require('~/assets/icons/picnic_area.svg'),
    elevator: require('~/assets/icons/elevator.svg'),
    first_aid: require('~/assets/icons/first_aid.svg'),
    guest_services: require('~/assets/icons/guest_services.svg'),
    restaurant: require('~/assets/icons/restaurant.svg'),
    restroom: require('~/assets/icons/restroom.svg'),
    restroom_female: require('~/assets/icons/restroom_female.svg'),
    restroom_male: require('~/assets/icons/restroom_male.svg'),
    stairs_down: require('~/assets/icons/stairs_down.svg'),
    stairs_up: require('~/assets/icons/stairs_up.svg'),
    stairs_up_down: require('~/assets/icons/stairs_up_down.svg'),
    store: require('~/assets/icons/store.svg'),
    stroller: require('~/assets/icons/stroller.svg'),
    wheelchair: require('~/assets/icons/wheelchair.svg')
};

// Pictograms (animals, dinosaurs, etc.)
// Note that the "require" functionality here comes from Parcel. If you were using webpack or another bundler, you may have to change this.
// For the open source release, we had to replace our pictogram assets with a placeholder SVG. That's what "example tardigrade" is.
const tfmPictograms = {
    bird: require('~/assets/icons/tardigrade.svg'),
    maximo: require('~/assets/icons/tardigrade.svg'),
    lion: require('~/assets/icons/tardigrade.svg'),
    totems: require('~/assets/icons/tardigrade.svg'),
    elephant: require('~/assets/icons/tardigrade.svg'),
    mask: require('~/assets/icons/tardigrade.svg'),
    pawnee_lodge: require('~/assets/icons/tardigrade.svg'),
    bushman: require('~/assets/icons/tardigrade.svg'),
    sarcophagus: require('~/assets/icons/tardigrade.svg'),
    sue: require('~/assets/icons/tardigrade.svg'),
    trike: require('~/assets/icons/tardigrade.svg'),
    stone_lion: require('~/assets/icons/tardigrade.svg'),
    maori_house: require('~/assets/icons/tardigrade.svg'),
};

/*** SET UP THE VIEW AND MAP ***/

// Configure the starting view

// Desktop starts zoomed out and centered
let startingCenter = [-9753489.474583665, 5140948.158950368];
let startingZoom = tfmZooms.medium - 0.1;

// Mobile view starts at east entrance
if (window.innerWidth < 568
) {
    startingCenter = [-9753360.67205395, 5140955.575372018]
    startingZoom = tfmZooms.close - 0.7;
}

// Create the view
const tfmView = new View({
    center: startingCenter,
    zoom: startingZoom,
    maxZoom: 27,
    minZoom: 16,
    constrainRotation: false, // Allow micro-adjusting the rotation so the museum doesn't look skewed
    rotation: 0.95 * Math.PI / 180, // To account for slight skew of Chicago's grid, which is off true north
    enableRotation: true, // Don't allow user to rotate map
});

// Create the map
const tfmMap = new Map({
    layers: [

        // Exterior basemap
        new TileLayer({
            source: new OSM({
            attributions: ['Built with <a href="https://openlayers.org/" target="_blank">OpenLayers</a> and <a href="https://qgis.org/" target="_blank">QGIS</a><br>Exterior map © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>'],
        }),
            opacity: 0.25,
        }),
        // Warning/secret layer in case the floor picker accidentally unselects all floors
        // This is necessary due to https://github.com/walkermatt/ol-layerswitcher/pull/360
        new VectorLayer({
            minZoom: tfmZooms.far,
            source: LayerSources.upper.outline,
            style: LayerStyles.WarningLayer,
            updateWhileInteracting: true,
        }),
        // Simple museum outline for zoom levels <=16
        new VectorLayer({
            maxZoom: tfmZooms.far,
            source: LayerSources.ground.outline,
            updateWhileInteracting: true,
            style: LayerStyles.ZoomedOutFootprint
        }),
        Floors.upper,
        Floors.main,
        Floors.ground

    ],
    interactions: defaultInteractions({
        altShiftDragRotate: false,
        pinchRotate: false,
        doubleClickZoom: true
    }),
    target: 'map',
    keyboardEventTarget: document,
    view: tfmView,
});


// Add layerswitcher controls
// https://github.com/walkermatt/ol-layerswitcher#api
// We use this as the floor switcher
let layerSwitcher = new LayerSwitcher(
    {
        reverse: false,
        startActive: true,
        activationMode: 'click',
        groupSelectStyle: 'group',
    }
);
tfmMap.addControl(layerSwitcher);
layerSwitcher.showPanel();


// Once the map renders
tfmMap.once('rendercomplete', function (event) {
    zoomToHash(); // Go to the area specified in the URL, if any

    // Preload sidebar images
    Object.entries(CMSData).forEach(([k, v]) => {
        if (v.fields && v.fields.imageUrl) {
            const thumbnailUrl = shrinkImage(v.fields.imageUrl);
            preloadImage(thumbnailUrl);
        }
    });

    tfmMap.renderSync(); // Redraw the map

});

window.addEventListener('hashchange', zoomToHash); // If someone manually types in a new hash with the map open

/*** CLICK HANDLER ***/
// We use map.onClick instead of OL's selection event because this seems more reliable... the selection event
// doesn't always catch clicks outside of features, so closing the sidebar becomes hard
tfmMap.on('click', e => {
    if (window.tfmDebug) console.log('Click event:', e);
    let counter = 0; // Ideally we want to find one feature only, not zero or more than one, but there isn't a forFirstFeatureAtPixel event

    tfmMap.forEachFeatureAtPixel(e.pixel, (feature, layer) => {
        if (counter > 0) return; // We only want the first feature, not all the ones beneath it
        counter++;

        // If nothing was clicked on, close the sidebar and return
        if ((!feature && !layer) || !feature.getId() || !CMSData[feature.getId()]) {
            closeSidebar();
            return;
        }

        // Setup
        const currentLevel = Floors.upper.getVisible() ? 'upper' : Floors.main.getVisible() ? 'main' : Floors.ground.getVisible() ? 'ground' : null;
        const tfmLayerType = layer.get('tfmLayerType');
        const id = feature.getId();
        const data = CMSData[id] ? CMSData[id].fields : null;

        // Debug info
        if (window.tfmDebug) {
            console.log(`Clicked on feature "${feature.getId()}", data:`, data);
            console.log(`Located in layer (type: ${tfmLayerType ?? undefined}):`, layer);
        }

        // Do different things depending on the layer type that was clicked on.
        // tfmLayerType is a custom parameter we set to each layer in LayerSettings{}
        switch (tfmLayerType) {
            // Exhibitions and other areas
            case 'area':


                // Closed areas should not be clickable
                if (data && (data.closed === 'Closed' || data.closed === 'Staff-Only')) return; // Check CMS first
                else if (feature.get('closed') > 0) return;

                // Only focus if it's in our CMS (i.e. has content added by an editor)
                if (data) {
                    zoomToFeature(feature, currentLevel);
                    setHash(currentLevel, id);
                }
                break;

            case 'label':

                // Try to find a matching pictogram on this floor, with Contentful data too
                if (LayerSources[currentLevel].pictograms.getFeatureById(id) && data) {
                    zoomToFeature(LayerSources[currentLevel].pictograms.getFeatureById(id));
                    setHash(currentLevel, id);
                }

                //  Otherwise, assume it's an area
                else {
                    zoomToFeature(LayerSources[currentLevel].areas.getFeatureById(id), currentLevel);
                    setHash(currentLevel, id)
                }
                break;

            case 'pictogram':
                // Closed areas should not be clickable
                if (data && (data.closed === 'Closed' || data.closed === 'Staff-Only')) return;

                if (id && data) {
                    zoomToFeature(feature);
                    setHash(currentLevel, id);
                }
                break;
        }


    }, {
        layerFilter: layer => {
            return layer.get('tfmClickable');
        },
    });

    if (!counter) closeSidebar(); // If no features were detected at all

})

/*** KEYBOARD SHORTCUTS ***/
document.onkeydown = function (evt) {
    evt = evt || window.event; // janky polyfill

    switch (evt.key) {
        case "Escape":
        case "Esc":
            closeSidebar();
            break;

        case "1":
            closeSidebar();
            switchFloors('ground');
            fitFloor('ground');
            break;

        case "2":
            closeSidebar();
            switchFloors('main');
            fitFloor('main');

            break;

        case "3":
            closeSidebar();
            switchFloors('upper');
            fitFloor('upper');

            break;

        // By default, OpenLayers only uses the + sign for zooming. This code makes the = sign also emulate
        // that behavior so you don't have to hold down the shift key
        case "=":
            tfmView.animate({zoom: tfmView.getZoom() + 1, duration: 100});
            break;

        case "0":
            closeSidebar();
            break;

    }

};

/*** DEBUG HELPERS ***/
// For easier debugging inside the console
if (window.tfmDebug) {
    window.tfmMap = tfmMap;
    window.tfmView = tfmView;
    window.contentfulData = CMSData;
}

/*** HELPER FUNCTIONS ***/
// Zoom to a specified feature (usually an area or pictogram)
// In the case of areas, also highlight them with a different color, basically a desaturated version of its specified color
let lastZoomedFeature;

function zoomToFeature(feature, currentLevel = null) {
    const id = feature.getId();
    const geometry = feature.getGeometry();
    const data = CMSData[id];

    resetHighlight();

    // Map padding
    let myPadding = [20, 400, 20, 20];
    let myZoom = tfmZooms.close;

    // For smaller devices
    if (window.innerWidth <= 500) {
        myZoom = tfmZooms.medium;
        // Set the bottom padding so the popup doesn't hide the exhibition
        myPadding = [10, 10, window.innerHeight * .7 + 10, 10]; // Equal to the sidebar.open height (in vh units) in index.css, line 236 or so
    }

    // If there's an area with a matching ID, highlight it
    // We have to do this search because OpenLayers doesn't have an easy way to return a layer from a feature
    if (currentLevel && LayerSources[currentLevel].areas.getFeatureById(id)) {

        // Highlight areas with a lighter version of its color
        if (!data) return;
        if (!data.fields.color) data.fields.color = "Error Red"; // Set default color
        feature.setStyle(
            new Style({
                fill: new Fill({
                    color: tfmColors[data.fields.color] + '88', // Approx 50% opacity (last two digits of hex code specify opacity)
                }),
                /*                text: new Text({
                                    text: selectedFeature.get('label') ? (tfmView.getZoom() >= tfmZooms.medium ? selectedFeature.get('label') : '') : null,
                                    font: "bold 10pt Graphik, sans-serif",
                                    fill: new Fill({
                                        color: 'white',
                                    }),
                                    overflow: true,
                                    opacity: (0.1 / tfmView.getResolution()) + 0.25,
                                }),
                                */
            })
        );
    }

    // Zoom to fit the feature
    tfmView.fit(geometry, {maxZoom: myZoom, duration: 500, padding: myPadding})

    createSidebar(data);
    openSidebar();

    lastZoomedFeature = feature;
}

// Create/re-create the sidebar with CMS data for a given POI
// Does NOT open it.
function createSidebar(poi) {

    // Don't open the sidebar if this is invalid
    if (!poi || !poi.fields) {
        if (window.tfmDebug) console.warn('Invalid POI for sidebar creation. POI should be a Contentful API entry.', poi);
        return false;
    }

    // Resize image
    const imageURL = shrinkImage(poi.fields.imageUrl) ?? null;

    let sidebarText = "<div id='sidebar-close-button'>&#10005;</div>";
    sidebarText += "<div id='sidebar-content'>";
    sidebarText += "<h2>" + poi.fields.fullName + "</h2>";

    // Add a link if it's provided in the CMS
    const linkURL = poi.fields && poi.fields.websiteUrl ? new URL(poi.fields.websiteUrl) : false;
    if (linkURL) {

        // Add UTM params to our outgoing URLs
        const utmParams = {
            source: "field",
            medium: "map",
        };
        Object.entries(utmParams).forEach(([k, v]) => linkURL.searchParams.set(`utm_${k}`, v));

        // Add the link
        sidebarText += `<p><a href='${linkURL.href}'><img src='${imageURL}'"></p>`;
        sidebarText += `<button style="background-color: ${tfmColors[poi.fields.color]};" class="poi-learn-more-button">Learn More</button></a>`;
    } else {
        sidebarText += `<p><img src='${imageURL}'"></p>`;
    }
    sidebarText += `<div id="sidebar-poi-description">${documentToHtmlString(poi.fields.shortDescription)}</div>`;
    sidebarText += '<p><a href="#" id="sidebar-go-back-link">« Return to map</a></p>';

    if (window.tfmDebug === true) {
        sidebarText += '<h2>Debug info</h2>';
        sidebarText += '<ul>';
        sidebarText += `<li>Short Name: ${poi.fields.shortName}</li>`;
        sidebarText += `<li>Contentful ID: <a href='https://app.contentful.com/spaces/sq6jwxz7772c/entries/${poi.sys.id}' target="_blank">${poi.sys.id}</a></li>`;
        sidebarText += `<li>Drupal Node: <a href="https://www.fieldmuseum.org/node/${poi.fields.nodeId}/edit" target="_blank">${poi.fields.nodeId}</a></li>`;
        sidebarText += `<li>Color: <span style="background-color: ${tfmColors[poi.fields.color]}; color: white; padding: 0 5px">${poi.fields.color}</span></li>`;
        sidebarText += '</ul>';
    }

    sidebarText += "<div>";

    // Replace the sidebar
    document.getElementById('tfm-sidebar').dataset.featureId = poi.sys.id;
    document.getElementById('tfm-sidebar').style.borderColor = tfmColors[poi.fields.color];
    document.getElementById('tfm-sidebar').innerHTML = sidebarText;

    // Add event listeners
    document.getElementById('tfm-sidebar').scrollTop = 0; // Scroll back up to the top
    document.getElementById('sidebar-close-button').addEventListener('click', closeSidebar);
    document.getElementById('sidebar-go-back-link').addEventListener('click', closeSidebar);

    // Also set document title to indicate current sidebar
    document.title = poi.fields.shortName + " - Field Museum Map";
}

// Open the sidebar. Use createSidebar() to create or update it first.
function openSidebar() {
    document.getElementById('tfm-sidebar').className = 'open';
}

// Close the sidebar, clear highlights, reset the title and hash
function closeSidebar() {
    resetHighlight();
    document.getElementById('tfm-sidebar').className = 'closed';
    document.title = "Field Museum Map";
    location.hash = '';
}

// Update the URL hash (like #ground.egypt)
function setHash(level, id) {
    location.hash = level + '.' + id;
}

// Reset previously selected feature if one already exists
function resetHighlight() {
    if (lastZoomedFeature) {
        lastZoomedFeature.setStyle(undefined); // Reset style
        lastZoomedFeature = null;
    }
}

// Manually switch to one floor or another
// Note that ol-layerswitcher does NOT do this; it has its own internal logic
// But it doesn't expose its methods, so we have to try to recreate it on our own
// We use this function in permalinks and keyboard shortcuts
function switchFloors(level) {
    Object.entries(Floors).forEach(([floor, data]) => {
        Floors[floor].setVisible(floor === level)
    });

    layerSwitcher.renderPanel(); // Resync the layer switcher
}

// Fit the entire floor in the viewport
// Right now only used by the keyboard shortcuts
// You might want to use this to zoom back out to the whole floor whenever a sidebar is closed... maybe?
function fitFloor(level) {
    tfmMap.once('rendercomplete', () => {
        tfmView.fit(LayerSources[level].outline.getExtent(), {padding: [50, 50, 50, 50], duration: 500})
    });
}

// Given a floor and/or exhibition (like #ground.egypt), zoom to it and pull up its sidebar, if relevant
function zoomToHash() {
    if (location.hash === undefined || location.hash === '') return;

    const hash = location.hash.substring(1);
    const matches = hash.match(/(.+?)(?:\.(.+))?$/); // expected format is #level.feature_id, like #main.maximo or #upper.evolving_planet
    const level = matches[1];
    const id = matches[2];

    // Make the specified level visible
    if (level && Object.keys(Floors).includes(level)) {
        switchFloors(level);

        // If an ID was also specified, zoom to it
        if (id) {
            tfmMap.once('rendercomplete', () => {
                if (LayerSources[level].areas.getFeatureById(id)) {
                    zoomToFeature(LayerSources[level].areas.getFeatureById(id), level);
                } else if (LayerSources[level].pictograms.getFeatureById(id)) {
                    zoomToFeature(LayerSources[level].pictograms.getFeatureById(id))
                } else {
                    console.warn(`Warning: Cannot zoom to invalid id "${id}" on ${level} floor`);
                }
            });
        }

        // Otherwise just fit the entire level
        else {
            fitFloor(level);
        }
    } else {
        console.warn('Warning: Could not zoom to invalid floor: ', level);
        console.info('Valid floors are: ', Object.keys(Floors).join(", "));
    }

}

// This preloads all the sidebar images
// Don't call this until the map is fully rendered, or you'd impact load time
function preloadImage(url) {
    try {
        var _img = new Image();
        _img.src = url;
    } catch (e) {
        if (window.tfmDebug) console.warn(e);
    }
}

// Generate a thumbnail using cloud services
function shrinkImage(url) {
    const newURL = new URL(url);

    // Use Drupal image styles if this is one of ours (to save CDN bandwidth)
    if (newURL.host === 'www.fieldmuseum.org') {
        newURL.pathname = newURL.pathname.replace(/\/sites\/default\/files\/(styles\/.+\/public\/)?/, '/sites/default/files/styles/gallery_500w/public/');
        return newURL.href
    }

    // Else use Cloudinary as an image CDN (can also replace this with imgix, etc.)
    else {
        // return 'https://res.cloudinary.com/your_cloudinary_account/image/fetch/w_500/' + newURL.href;
        return newURL.href;
    }
}
