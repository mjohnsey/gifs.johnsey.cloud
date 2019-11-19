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
  created() {
    this.fetchInventory().then((jInventory) => {
      this.inventory = jInventory
    })
  }
});
