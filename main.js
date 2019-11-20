_.mixin({
  'sortKeysBy': function (obj, comparator) {
      var keys = _.sortBy(_.keys(obj), function (key) {
          return comparator ? comparator(obj[key], key) : key;
      });
  
      return _.zipObject(keys, _.map(keys, function (key) {
          return obj[key];
      }));
  }
});

const app = new Vue({
  el: '#gif-links',
  data: {
    inventory: {},
  },
  methods: {
    async fetchInventory() {
      const resp = await fetch('./inventory.json')
      return await resp.json()
    }
  },
  computed:{
    orderedInventory() {
      const res = _.sortKeysBy(this.inventory.gifs);
      return res;
    }
  },
  created() {
    this.fetchInventory().then((jInventory) => {
      this.inventory = jInventory
    })
  }
});
