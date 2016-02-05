/*
	Graph of squares. Handles grid cell management (placement math for eg pathfinding, range, etc) and grid conversion math.
	Interface:
	type
	size - number of cells (in radius); only used if the map is generated
	cellSize
	cells - a hash so we can have sparse maps
	numCells
	extrudeSettings
	autogenerated
	cellShape
	cellGeo
	cellShapeGeo

	@author Corey Birnbaum https://github.com/vonWolfehaus/
 */
vg.SqrGrid = function(config) {
	config = config || {};
	/*  ______________________________________________
		GRID INTERFACE:
	*/
	this.type = vg.SQR;
	this.size = 5; // only used for generated maps
	this.cellSize = typeof config.cellSize === 'undefined' ? 10 : config.cellSize;
	this.cells = {};
	this.numCells = 0;

	this.extrudeSettings = null;
	this.autogenerated = false;

	// create base shape used for building geometry
	var verts = [];
	verts.push(new THREE.Vector3());
	verts.push(new THREE.Vector3(-this.cellSize, this.cellSize));
	verts.push(new THREE.Vector3(this.cellSize, this.cellSize));
	verts.push(new THREE.Vector3(this.cellSize, -this.cellSize));
	// copy the verts into a shape for the geometry to use
	this.cellShape = new THREE.Shape();
	this.cellShape.moveTo(-this.cellSize, -this.cellSize);
	this.cellShape.lineTo(-this.cellSize, this.cellSize);
	this.cellShape.lineTo(this.cellSize, this.cellSize);
	this.cellShape.lineTo(this.cellSize, -this.cellSize);
	this.cellShape.lineTo(-this.cellSize, -this.cellSize);

	this.cellGeo = new THREE.Geometry();
	this.cellGeo.vertices = verts;
	this.cellGeo.verticesNeedUpdate = true;

	this.cellShapeGeo = new THREE.ShapeGeometry(this.cellShape);

	/*  ______________________________________________
		PRIVATE
	*/

	this._fullCellSize = this.cellSize * 2;
	this._hashDelimeter = '.';
	// pre-computed permutations
	this._directions = [new vg.Cell(+1, 0, 0), new vg.Cell(0, -1, 0),
						new vg.Cell(-1, 0, 0), new vg.Cell(0, +1, 0)];
	this._diagonals = [new vg.Cell(-1, -1, 0), new vg.Cell(-1, +1, 0),
					   new vg.Cell(+1, +1, 0), new vg.Cell(+1, -1, 0)];
	// cached objects
	this._list = [];
	this._vec3 = new THREE.Vector3();
	this._cel = new vg.Cell();
	this._conversionVec = new THREE.Vector3();
	this._geoCache = [];
	this._matCache = [];
};

vg.SqrGrid.prototype = {
	/*
		________________________________________________________________________
		High-level functions that the Board interfaces with (all grids implement)
	 */

	cellToPixel: function(cell) {
		this._vec3.x = cell.q * this._fullCellSize;
		this._vec3.y = cell.h;
		this._vec3.z = cell.r * this._fullCellSize;
		return this._vec3;
	},

	pixelToCell: function(pos) {
		var q = Math.round(pos.x / this._fullCellSize);
		var r = Math.round(pos.z / this._fullCellSize);
		return this._cel.set(q, r, 0);
	},

	getCellAt: function(pos) {
		var q = Math.round(pos.x / this._fullCellSize);
		var r = Math.round(pos.z / this._fullCellSize);
		this._cel.set(q, r);
		return this.cells[this.cellToHash(this._cel)];
	},

	getNeighbors: function(cell, diagonal, filter) {
		// always returns an array
		var i, n, l = this._directions.length;
		this._list.length = 0;
		for (i = 0; i < l; i++) {
			this._cel.copy(cell);
			this._cel.add(this._directions[i]);
			n = this.cells[this.cellToHash(this._cel)];
			if (!n || (filter && !filter(cell, n))) {
				continue;
			}
			this._list.push(n);
		}
		if (diagonal) {
			for (i = 0; i < l; i++) {
				this._cel.copy(cell);
				this._cel.add(this._diagonals[i]);
				n = this.cells[this.cellToHash(this._cel)];
				if (!n || (filter && !filter(cell, n))) {
					continue;
				}
				this._list.push(n);
			}
		}
		return this._list;
	},

	getRandomCell: function() {
		var c, i = 0, x = vg.Tools.randomInt(0, this.numCells);
		for (c in this.cells) {
			if (i === x) {
				return this.cells[c];
			}
			i++;
		}
		return this.cells[c];
	},

	cellToHash: function(cell) {
		return cell.q+this._hashDelimeter+cell.r; // s is not used in a square grid
	},

	distance: function(cellA, cellB) {
		var d = Math.max(Math.abs(cellA.q - cellB.q), Math.abs(cellA.r - cellB.r));
		d += cellB.h - cellA.h; // include vertical size
		return d;
	},

	clearPath: function() {
		var i, c;
		for (i in this.cells) {
			c = this.cells[i];
			c._calcCost = 0;
			c._priority = 0;
			c._parent = null;
			c._visited = false;
		}
	},

	traverse: function(cb) {
		var i;
		for (i in this.cells) {
			cb(this.cells[i]);
		}
	},

	generateTile: function(cell, scale, material) {
		var height = Math.abs(cell.h);
		if (height < 1) height = 1;

		var geo = this._geoCache[height];
		if (!geo) {
			this.extrudeSettings.amount = height;
			geo = new THREE.ExtrudeGeometry(this.cellShape, this.extrudeSettings);
			this._geoCache[height] = geo;
		}

		/*mat = this._matCache[c.matConfig.mat_cache_id];
		if (!mat) { // MaterialLoader? we currently only support basic stuff though. maybe later
			mat.map = Loader.loadTexture(c.matConfig.imgURL);
			delete c.matConfig.imgURL;
			mat = new THREE[c.matConfig.type](c.matConfig);
			this._matCache[c.matConfig.mat_cache_id] = mat;
		}*/

		var t = new vg.Tile({
			size: this.cellSize,
			scale: scale,
			cell: cell,
			geometry: geo,
			material: material
		});

		cell.tile = t;

		return t;
	},

	generateTiles: function(config) {
		config = config || {};
		var tiles = [];
		var settings = {
			tileScale: 0.95,
			cellSize: this.cellSize,
			material: null,
			extrudeSettings: {
				amount: 1,
				bevelEnabled: true,
				bevelSegments: 1,
				steps: 1,
				bevelSize: 0.5,
				bevelThickness: 0.5
			}
		}
		settings = vg.Tools.merge(settings, config);

		/*if (!settings.material) {
			settings.material = new THREE.MeshPhongMaterial({
				color: vg.Tools.randomizeRGB('30, 30, 30', 10)
			});
		}*/

		// overwrite with any new dimensions
		this.cellSize = settings.cellSize;
		this._fullCellSize = this.cellSize * 2;

		this.autogenerated = true;
		this.extrudeSettings = settings.extrudeSettings;

		var i, t, c;
		for (i in this.cells) {
			c = this.cells[i];
			t = this.generateTile(c, settings.tileScale, settings.material);
			t.position.copy(this.cellToPixel(c));
			t.position.y = 0;
			tiles.push(t);
		}
		return tiles;
	},

	generateTilePoly: function(material) {
		if (!material) {
			material = new THREE.MeshBasicMaterial({color: 0x24b4ff});
		}
		var mesh = new THREE.Mesh(this.cellShapeGeo, material);
		this._vec3.set(1, 0, 0);
		mesh.rotateOnAxis(this._vec3, vg.PI/2);
		return mesh;
	},

	// create a flat, square-shaped grid
	generate: function(config) {
		config = config || {};
		this.size = typeof config.size === 'undefined' ? this.size : config.size;
		var x, y, c;
		var half = Math.ceil(this.size / 2);
		for (x = -half; x < half; x++) {
			for (y = -half; y < half; y++) {
				c = new vg.Cell(x, y + 1);
				this.add(c);
			}
		}
	},

	generateOverlay: function(size, overlayObj, overlayMat) {
		var x, y;
		var half = Math.ceil(size / 2);
		for (x = -half; x < half; x++) {
			for (y = -half; y < half; y++) {
				this._cel.set(x, y); // define the cell
				var line = new THREE.Line(this.cellGeo, overlayMat);
				line.position.copy(this.cellToPixel(this._cel));
				line.rotation.x = 90 * vg.DEG_TO_RAD;
				overlayObj.add(line);
			}
		}
	},

	add: function(cell) {
		var h = this.cellToHash(cell);
		if (this.cells[h]) {
			// console.warn('A cell already exists there');
			return;
		}
		this.cells[h] = cell;
		this.numCells++;

		return cell;
	},

	remove: function(cell) {
		var h = this.cellToHash(cell);
		if (this.cells[h]) {
			delete this.cells[h];
			this.numCells--;
		}
	},

	dispose: function() {
		this.cells = null;
		this.numCells = 0;
		this.cellShape = null;
		this.cellGeo.dispose();
		this.cellGeo = null;
		this.cellShapeGeo.dispose();
		this.cellShapeGeo = null;
		this._list = null;
		this._vec3 = null;
		this._conversionVec = null;
		this._geoCache = null;
		this._matCache = null;
	},

	/*
		Load a grid from a parsed json object.
		json = {
			extrudeSettings,
			size,
			cellSize,
			autogenerated,
			cells: [],
			materials: [
				{
					cache_id: 0,
					type: 'MeshLambertMaterial',
					color, ambient, emissive, reflectivity, refractionRatio, wrapAround,
					imgURL: url
				},
				{
					cacheId: 1, ...
				}
				...
			]
		}
	*/
	load: function(url, callback, scope) {
		vg.Tools.getJSON({
			url: url,
			callback: function(json) {
				this.fromJSON(json);
				callback.call(scope || null, json);
			},
			cache: false,
			scope: this
		});
	},

	fromJSON: function(json) {
		var i, c;
		var cells = json.cells;

		this.cells = {};
		this.numCells = 0;

		this.size = json.size;
		this.cellSize = json.cellSize;
		this._fullCellSize = this.cellSize * 2;
		this.extrudeSettings = json.extrudeSettings;
		this.autogenerated = json.autogenerated;

		for (i = 0; i < cells.length; i++) {
			c = new vg.Cell();
			c.copy(cells[i]);
			this.add(c);
		}
	},

	toJSON: function() {
		var json = {
			size: this.size,
			cellSize: this.cellSize,
			extrudeSettings: this.extrudeSettings,
			autogenerated: this.autogenerated
		};
		var cells = [];
		var c, k;

		for (k in this.cells) {
			c = this.cells[k];
			cells.push({
				q: c.q,
				r: c.r,
				s: c.s,
				h: c.h,
				walkable: c.walkable,
				userData: c.userData
			});
		}
		json.cells = cells;

		return json;
	}
};

vg.SqrGrid.prototype.constructor = vg.SqrGrid;
