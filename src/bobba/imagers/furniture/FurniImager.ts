import FurniBase from "./FurniBase";
import FurniAsset from "./FurniAsset";

export const LOCAL_RESOURCES_URL = "//images.bobba.io/hof_furni/";

export default class FurniImager {
    ready: boolean;
    bases: any;
    offsets: any;
    furnidata: any;

    constructor() {
        this.ready = false;
        this.bases = { roomitem: {}, wallitem: {} };
        this.offsets = {};
    }

    findItemByName(itemName: string) {
        for (let itemTypes in this.furnidata) {
            for (let itemId in this.furnidata[itemTypes]) {
                const item = this.furnidata[itemTypes][itemId];
                if (item.classname === itemName) {
                    return { item, type: itemTypes };
                }
            }
        }
        return null;
    }

    findItemById(type: ItemType, itemId: number): string | null {
        if (this.furnidata[type + 'types'][itemId] != null) {
            return this.furnidata[type + 'types'][itemId];
        }
        return null;
    }

    loadItemBase(type: ItemType, itemId: number, size: Size): Promise<FurniBase> {
        const rawItem = this.findItemById(type, itemId) as any;
        if (rawItem == null) {
            return new Promise((resolve, reject) => {
                reject('invalid itemId ' + itemId);
            });
        }
        const rawItemName = rawItem.classname;

        const { itemName } = splitItemNameAndColor(rawItemName);

        if (this.bases[type][itemId] != null && this.bases[type][itemId].promise != null) {
            return this.bases[type][itemId].promise;
        }

        this.bases[type][itemId] = new FurniBase(itemId, rawItem, size);

        if (this.offsets[itemName] == null) {
            this.offsets[itemName] = { promise: this._fetchOffsetAsync(itemName), data: {} };
        }
        const offsetPromise = this.offsets[itemName].promise as Promise<any>;

        const finalPromise: Promise<FurniBase> = new Promise((resolve, reject) => {
            offsetPromise.then(offset => {
                const visualization = offset.visualization[64];
                let states = { "0": { count: 1 } } as any;

                this.bases[type][itemId].offset = offset;

                if (visualization.animations != null) {
                    for (let stateId in visualization.animations) {
                        let count = 1;
                        for (let animationLayer of visualization.animations[stateId].layers) {
                            if (animationLayer.frameSequence != null) {
                                if (count < animationLayer.frameSequence.length) {
                                    count = animationLayer.frameSequence.length;
                                }
                            }
                        }
                        states[stateId] = { count };
                        if (visualization.animations[stateId].transitionTo != null) {
                            states[stateId].transitionTo = visualization.animations[stateId].transitionTo;
                            states[states[stateId].transitionTo].transition = stateId;
                        }
                    }
                }

                const assetsPromises = [];

                for (let assetId in offset.assets) {
                    const asset = offset.assets[assetId];
                    const fixedName = asset.name.split(itemName + '_')[1] as String;
                    if (fixedName.startsWith(size.toString())) {
                        let resourceName = asset.name;
                        if (asset.source != null) {
                            resourceName = asset.source;
                        }
                        assetsPromises.push(this._downloadImageAsync(itemName, resourceName).then(img => {
                            this.bases[type][itemId].assets[asset.name] = new FurniAsset(img, asset.x, asset.y, asset.flipH != null && asset.flipH === '1');
                        }).catch(err => {
                            reject(err);
                        }));
                    }
                }
                this.bases[type][itemId].states = states;

                Promise.all(assetsPromises).then(() => {
                    resolve(this.bases[type][itemId]);
                }).catch(err => {
                    reject(err);
                });

            }).catch(err => {
                reject("Error downloading offset for " + itemName + " reason: " + err);
            });
        });
        this.bases[type][itemId].promise = finalPromise;
        return finalPromise;
    }

    initialize(): Promise<void> {
        const p = this._loadFiles();
        return Promise.all(p).then(() => {
            this.ready = true;
        });
    }

    _loadFiles(): Promise<void>[] {
        return [
            this._fetchJsonAsync(LOCAL_RESOURCES_URL + "furnidata.json")
                .then(data => {
                    this.furnidata = data;
                }),
        ];
    }

    _downloadImageAsync(itemName: string, resourceName: string): Promise<HTMLImageElement> {
        let img = new Image();
        let d: Promise<HTMLImageElement> = new Promise((resolve, reject) => {
            img.onload = () => {
                //console.log("downloaded " + this.itemName + " -> " + this.resourceName);
                resolve(img);
            };
            img.onerror = () => {
                //console.log("NOT DOWNLOADED " + this.itemName + " -> " + this.resourceName);
                reject('Could not load image: ' + img.src);
            };
        });
        img.crossOrigin = "anonymous";
        img.src = LOCAL_RESOURCES_URL + itemName + "/" + resourceName + ".png";
        return d;
    }

    _fetchJsonAsync(URL: string): Promise<object> {
        return new Promise((resolve, reject) => {

            const options: RequestInit = {
                method: 'GET',
                mode: 'cors',
                cache: 'default',
            };

            fetch(URL, options)
                .then(response => response.json())
                .then(data => resolve(data))
                .catch(err => reject(err));
        });
    }

    _fetchOffsetAsync(uniqueName: string): Promise<object> {
        return new Promise((resolve, reject) => {
            this._fetchJsonAsync(LOCAL_RESOURCES_URL + uniqueName + '/furni.json').then(data => {
                this.offsets[uniqueName].data = data;
                resolve(data);
            }).catch(err => reject(err));
        });
    }
}

export type Size = 32 | 64;
export type ItemType = 'roomitem' | 'wallitem';
export interface NameColorPair { itemName: string, colorId: number };
export type Direction = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const splitItemNameAndColor = (itemName: string): NameColorPair => {
    let colorId = 0;
    if (itemName.includes("*")) {
        const longFurniName = itemName.split("*");
        itemName = longFurniName[0];
        colorId = parseInt(longFurniName[1]);
    }
    return { itemName, colorId }
};