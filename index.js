// 引入 siyuan 包中的相关的组件和方法
const { Plugin, Menu, getFrontend, Dialog, openTab } = require("siyuan");

// #region **************************** 定义插件，这是插件的总入口  ****************************
module.exports = class FavoritesPlugin extends Plugin {

  /**
    * 插件默认函数：在插件加载的时候执行
    */
  async onload() {

    // 获取前端类型：手机还是PC
    const frontEnd = getFrontend();
    // 判断是否是手机
    this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";

    // 添加侧边栏面板，用于输出信息
    console.log("Favorites Plugin Init--info");
    this.favoritesUtil = new Favorites(this);

    // 监听文档树菜单事件
    this.eventBus.on('open-menu-doctree', this.cbMenuDocTree);
    // 监听文档删除事件
    this.eventBus.on('delete-doc', this.cbRemove);
     // 监听 ws-main 事件
    this.eventBus.on("ws-main",this.cbWsMain);

    setTimeout(async () => {
      console.log('loadFavoritesInfoFromLocal');
      await this.favoritesUtil.loadFavoritesInfoFromLocal();
    }, 1000);
  }

  /**
   * 插件卸载
   */
  onunload() {

    // 移除监听事件
    this.eventBus.off('open-menu-doctree', this.cbMenuDocTree);
    this.eventBus.off('delete-doc', this.cbRemove);
    this.eventBus.off("ws-main",this.cbWsMain);

    // 如果存在收藏夹面板，则删除
    let favPanel = document.getElementById('favorites-panel');
    if (favPanel) {
      favPanel.remove();
    }
  }

  // 文档树菜单事情
  cbMenuDocTree = this.cbMenuDocTree.bind(this);
  cbMenuDocTree({ detail }) {
    console.log('open-menu-doctree ！', detail);
    if (detail.type !== "doc") {
      return;
    }
    // 获取当前菜单
    const menu = detail.menu;

    // 添加分隔线
    menu.addSeparator();

    // 添加菜单项
    menu.addItem({
      icon: "iconStar",
      label: "添加到收藏夹",
      click: async () => {
        console.info("添加到收藏夹");
        console.info('已添加到收藏夹');

        // 获取 id 为 favorites-panel 的面板，如果不存在就新建
        let favoritesPanel = document.getElementById('favorites-panel');
        if (!favoritesPanel) {
          favoritesPanel = await this.favoritesUtil.createFavoritesPanel();
        }

        // 获取当前文档元素
        const currentDoc = detail.elements[0];
        if (!currentDoc) {
          console.error('未找到文档元素');
          return;
        }

        this.favoritesUtil.addFavoritesPage(currentDoc, favoritesPanel);
      }
    });
  }

  // 文档删除事件
  cbRemove = this.cbRemove.bind(this);
  cbRemove({ detail }) {
    console.log('文档删除事件触发！', detail);
  }

  // ws-main 事件
  cbWsMain = this.cbWsMain.bind(this);
  async cbWsMain({ detail }){
    if (detail.cmd === 'removeDoc') {
      console.log('delete-doc-detail', detail);
      await this.handleDeleteDoc(detail.data);
    }
    else if (detail.cmd === 'rename') {
      await this.handleRename(detail.data);
    }
    else if (detail.cmd === 'create') {
      await this.handleAddDoc(detail.data)
    } else if (detail.cmd === 'transactions') {
      await this.handleTransactions(detail.data)
    } else if (detail.cmd === 'moveDoc') {
      await this.handleMoveDoc(detail.data)
    }

  }
  
  //#region **************************** 事件处理  ****************************
  async handleAddDoc(data) {
    console.log("文档新建文档:", data);

    // data.path 按照 / 分割，获取最后一个元素
    const pathSegments = data.path.split('/');
    let lastSegment = pathSegments[pathSegments.length - 1];
    console.log('lastSegment1', lastSegment);
    // 移除 lastSegment 的 .sy 后缀
    lastSegment = this.favoritesUtil.clearSyExt(lastSegment);
    console.log('lastSegment', lastSegment);
    const id = lastSegment;
    if (id) {
      // 你可以在这里执行自定义操作，例如记录日志、同步到其他系统等
      console.log("要更新的文档块 ID:", id);
      await this.favoritesUtil.updateFavoriteWhenAddDoc(id);

      await this.favoritesUtil.saveFavoritesInfoToLocal();
    }
  }

  async handleTransactions(data) {
    console.log("文档更新图标:", data);

    data.forEach(item => {

      item.doOperations.forEach(operation => {
        if (operation.action === 'updateAttrs' && operation.data.old.type === 'doc' && operation.data.new.icon !== operation.data.old.icon) {
          this.favoritesUtil.updateIconWhenTransactions(operation.data.new.id, operation.data.new.icon);
        }
      });
      // // 如果 data.action 是 updateAttrs 则更新图标,并且 data.data.new.type  是 doc 并且 图标有变化
      // if (item.action === 'updateAttrs' && item.data.old.type === 'doc' && item.data.new.icon !== item.data.old.icon) {
      //   this.favoritesUtil.updateIconWhenTransactions(item.data.new.id, item.data.new.icon);
      // }
    });

    await this.favoritesUtil.saveFavoritesInfoToLocal();
  }

  async handleRename(data) {
    console.log("文档被重命名:", data);
    this.favoritesUtil.updateFavoriteWhenRename(data.id, data.title);
    await this.favoritesUtil.saveFavoritesInfoToLocal();
  }

  async handleDeleteDoc(data) {
    console.log("文档被删除:", data);

    if (data.ids) {
      for (const id of data.ids) {
        // 你可以在这里执行自定义操作，例如记录日志、同步到其他系统等
        console.log("删除的文档块 ID:", id);

        // let info = await this.favoritesUtil.getSubFileCountById(id);
        this.favoritesUtil.updateFavoriteWhenRemoveDoc(id);
      }

      await this.favoritesUtil.saveFavoritesInfoToLocal();
    }
  }

  async handleMoveDoc(data) {
    console.log("文档被移动:", data);
    let fromPaths = data.fromPath.split('/');

    let id = this.favoritesUtil.clearSyExt(fromPaths[fromPaths.length - 1]);
    let fromNotebook = data.fromNotebook;
    let fromParentid = fromPaths.length > 1 ? fromPaths[fromPaths.length - 2] : '';

    let toNotebook = data.toNotebook;
    let toPaths = data.newPath.split('/');
    let toParentid = toPaths.length > 1 ? toPaths[toPaths.length - 2] : '';

    // 移除文档,不移除 pg-favorites 为 1 ，说明是收藏夹，不移除
    this.favoritesUtil.updateFavoriteWhenRemoveOrAddDocCall(id, fromNotebook, fromParentid, false, true);
    // 增加文档
    this.favoritesUtil.updateFavoriteWhenRemoveOrAddDocCall(id, toNotebook, toParentid, true, true);

    await this.favoritesUtil.saveFavoritesInfoToLocal();
  }
  //#endregion  **************************** 事件处理
  
}
// #endregion  **************************** 定义插件，这是插件的总入口
/**
 * 封装一个插件工具类，用于处理收藏夹相关操作
 */
class Favorites {

  /** 保存路径 */
  savePath = '/data/snippets/MiniFavorites.json';

  /** 创建 ul 元素 */
  createUl() {
    const ul = document.createElement('ul');
    ul.setAttribute('pg-data-type', 'ul');
    return ul;
  }
  /** 创建 li 元素 */
  creatLi() {
    const li = document.createElement('li');
    li.setAttribute('pg-data-type', 'li');
    return li;
  }

  /** 创建收藏夹面板 */
  createFavoritesPanel() {
    const docTree = document.querySelector('.file-tree .block__icons').nextElementSibling;
    const favoritesPanel = document.createElement('div');
    favoritesPanel.id = 'favorites-panel';
    favoritesPanel.className = 'fn__flex';
    favoritesPanel.innerHTML = `
  <ul class="favorites-ignreo-item">
    <li class="b3-list-item b3-list-item--hide-action">
        <span class="b3-list-item__icon b3-tooltips b3-tooltips__n popover__block">⭐</span>
        <span class="b3-list-item__text ariaLabel" aria-label="收藏夹">收藏夹</span>
    </li>
  </ul>
  `;
    docTree.parentElement.insertBefore(favoritesPanel, docTree);
    return favoritesPanel;
  }

  /** 创建收藏夹项 
   * @param {string} id 文档 id
   * @param {string} path 文档路径
   * @param {string} notebook 笔记本
   * @param {string} name 文档名称
   * @param {number} count 子文档数量
   * @param {number} index 索引,从0开始，用来定义层级
   * @param {string} icon 文档图标
  */
  createFavoriteItem(id, path, notebook, name, count, index, icon) {
    const li = this.creatLi();

    // 设置 li 的属性
    li.className = 'b3-list-item b3-list-item--hide-action';
    li.setAttribute('data-url', notebook);
    li.setAttribute('data-node-id', id);
    li.setAttribute('data-path', path);
    li.setAttribute('data-name', name);
    li.setAttribute('data-count', count);
    // li.style.setProperty('--file-toggle-width', `${0 + 20 * (index)}px`);
    li.style.setProperty('--file-toggle-width', `${0 + 18 * (index)}px`);

    // 创建左侧的箭头
    const spanArrow = document.createElement('span');
    // spanArrow.className = 'b3-list-item__arrow';

    if (count > 0) {
      spanArrow.className = 'b3-list-item__toggle b3-list-item__toggle--hl';
      spanArrow.innerHTML = `<svg class="b3-list-item__arrow"><use xlink:href="#iconRight"></use></svg>`;
    } else {
      spanArrow.className = 'b3-list-item__toggle b3-list-item__toggle--hl fn__hidden';
      spanArrow.innerHTML = `<svg class="b3-list-item__arrow"><use xlink:href="#iconRight"></use></svg>`;
    }
    li.appendChild(spanArrow);

    // 创建文档的图标
    const iconSpan = document.createElement('span');
    iconSpan.className = 'b3-list-item__icon b3-tooltips b3-tooltips__n popover__block';
    iconSpan.setAttribute('aria-label', '修改图标');
    iconSpan.textContent = icon || '📄';
    li.appendChild(iconSpan);

    // 创建文档的名称
    const textSpan = document.createElement('span');
    textSpan.className = 'b3-list-item__text';
    textSpan.textContent = this.clearSyExt(name);  //

    li.appendChild(textSpan);

    // 添加到列表项
    li.appendChild(spanArrow);
    li.appendChild(iconSpan);
    li.appendChild(textSpan);

    // 点击列表会打开文档
    li.addEventListener('click', async (event) => {
      window.openFileByURL(`siyuan://blocks/${id}`);
    })

    return li;
  }

  /** 移除 .sy 后缀 */
  clearSyExt(txt) {
    return txt.replace(/\.sy$/, '');
  }

  /** 加载子文档
   * @param {HTMLElement} liElement 列表项
   * @param {HTMLElement} ul2 子文档列表
   * @param {number} index 索引,从0开始，用来定义层级
  */
  async loadChildBlocks(liElement, ul2 = null, index = 0) {
    const nodeid = liElement.getAttribute('data-node-id');
    const path = liElement.getAttribute('data-path');
    const notebook = liElement.getAttribute('data-url');
    console.log('notebook', notebook);
    console.log('path', path);
    this.getFavoritesPanel(liElement, path, notebook, ul2, index);
  }

  /** 获取收藏面板对象
   * @param {HTMLElement} liElement 列表项
   * @param {string} path 文档路径
   * @param {string} notebook 笔记本
   * @param {HTMLElement} ul2 子文档列表
   * @param {number} index 索引,从0开始，用来定义层级
  */
  async getFavoritesPanel(liElement, path, notebook, ul2, index = 0) {
    // 通过 Siyuan 的 API 获取孩子列表
    const response = await fetch('/api/filetree/listDocsByPath', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        notebook: notebook,
        path: path
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('子文档data', data.data);

    if (data.code === 0 && data.data && data.data.files) {
      // 移除现有的子文档节点
      const existingChild = liElement.nextElementSibling;
      if (existingChild && existingChild.classList.contains('b3-list')) {
        existingChild.remove();
      }

      let ul = ul2 || this.createUl();
      // let ul = this.createUl();
      ul.className = 'b3-list b3-list--background';
      var addLi = (file) => {
        let li = this.createFavoriteItem(file.id, file.path, notebook, file.name, file.subFileCount, index+1, file.icon);
        // 添加展开折叠按钮
        this.AddToggle(li,index+1);  // +1
        ul.appendChild(li);
        // 不再重复添加子文档，每次都只展开一层
        // if (file.subFileCount > 0) {
        //   this.getFavoritesPanel(li, file.path, notebook, ul, index++);
        // }
      };
      data.data.files.forEach(file => addLi(file));

      // 将 ul 作为 li 的兄弟节点插入
      if (ul.parentElement === null || ul.parentElement === undefined) {
        console.log('ul.parentElement', ul.parentElement);
        liElement.parentElement.insertBefore(ul, liElement.nextSibling);
      }
    }
  }

  /** 添加页面到收藏夹
   * @param {HTMLElement} liElement 列表项
   * @param {HTMLElement} favoritesPanel 收藏夹面板
  */
  async addFavoritesPage(liElement, favoritesPanel) {

    let favPanel = document.getElementById('favorites-panel');
    // 如果存在，则执行判断是否存在
    if (favPanel !== null && favPanel !== undefined) {
      let liElements = favoritesPanel.querySelectorAll('ul:not(.favorites-ignreo-item)  li[pg-favorites="1"]');
      // 判断是否已经存在
      console.log('liElements', liElements);
      // 判断是否存一个 data-node-id 相同的 li  
      let sameLi = Array.from(liElements).find(li => li.getAttribute('data-node-id') === liElement.getAttribute('data-node-id'));
      if (sameLi !== null && sameLi !== undefined) {
        console.warn(sameLi.getAttribute('data-name') + '已经存在');
        return;
      }
    }

    const nodeid = liElement.getAttribute('data-node-id');
    const path = liElement.getAttribute('data-path');
    const notebook = await this.getnotebook(liElement)
    const dataname = liElement.getAttribute('data-name');
    const datacount = liElement.getAttribute('data-count');
    const datatype = liElement.getAttribute('data-type');
    const dataclass = liElement.getAttribute('class');
    const datastyle = liElement.getAttribute('style');
    const text = liElement.querySelector('.b3-list-item__text').innerText;
    const icon = liElement.querySelector('.b3-list-item__icon').innerText;

    let page = this.createUl();
    let li = this.createFavoriteItem(nodeid, path, notebook, dataname, datacount, 0, icon);
    li.setAttribute('pg-favorites', '1');
    page.appendChild(li);
    favoritesPanel.appendChild(page);

    let span = document.createElement('span');
    span.className = 'b3-list-item__action b3-tooltips b3-tooltips__w';
    span.innerHTML = `<svg><use xlink:href="#iconTrashcan"></use></svg>`;
    span.setAttribute('data-type', 'remove');
    span.setAttribute('aria-label', '删除');
    span.addEventListener('click', async (event) => {
      console.log('remove');
      event.stopPropagation();
      this.removeFavoritesPage(li);
      await this.saveFavoritesInfoToLocal();
    });
    li.appendChild(span);

    // 添加展开折叠按钮
    this.AddToggle(li,0);

    // 保存收藏夹信息
    await this.saveFavoritesInfoToLocal();
  }

  /** 添加展开/折叠按钮触发事件
   * @param {HTMLElement} li 列表项
   * @param {number} index 索引,从0开始，用来定义层级
  */
  async AddToggle(li,index=0) {

    // 添加展开/折叠按钮
    const toggle = li.querySelector('.b3-list-item__toggle');
    let isExpanded = false; // 默认展开

    toggle.addEventListener('click', async (event) => {
      console.log('toggle');
      event.stopPropagation();
      isExpanded = !isExpanded;

      if (isExpanded) {
        await this.Expanded(li,index);
      } else {
        this.UnExpanded(li);
      }
    });
  }

  /** 展开
   * @param {HTMLElement} li 列表项
   * @param {number} index 索引,从0开始，用来定义层级
  */
  async Expanded(li,index=0) {
    const toggle = li.querySelector('.b3-list-item__toggle');
    const arrowIcon = toggle.querySelector('.b3-list-item__arrow');
    arrowIcon.classList.add('b3-list-item__arrow--open');
    var liElement = toggle.closest('[pg-data-type="li"]');
    console.log('liElement', liElement);
    await this.loadChildBlocks(liElement,null,index);
    console.log('展开',index);
  }


  /** 折叠
   * @param {HTMLElement} li 列表项
  */
  UnExpanded(li) {
    const toggle = li.querySelector('.b3-list-item__toggle');
    const arrowIcon = toggle.querySelector('.b3-list-item__arrow');
    arrowIcon.classList.remove('b3-list-item__arrow--open');
    const nextSibling = li.nextElementSibling;
    if (nextSibling && nextSibling.classList.contains('b3-list')) {
      nextSibling.remove();
      console.log('折叠2');
    }
  }


  /** 获取笔记本的id
   * @param {HTMLElement} liElement 列表项
  */
  async getnotebook(liElement) {
    let parent = liElement.parentElement;

    while (parent !== null && parent !== undefined) {
      if (parent.classList && parent.classList.contains('file-tree')) {
        return null;
      }
      if (parent.tagName === 'UL' && parent.hasAttribute('data-url')) {
        return parent.getAttribute('data-url');
      }
      parent = parent.parentElement;
    }
  }

  /** 移除收藏夹中的页面
   * @param {HTMLElement} liElement 列表项
  */
  async removeFavoritesPage(liElement) {


    let parent = liElement.parentElement;
    const isFavorite = liElement.hasAttribute('pg-favorites') && liElement.getAttribute('pg-favorites') === '1';
    liElement.remove();
    // 如果 parent 没有了子元素
    if (parent.childElementCount === 0 || isFavorite) {
      parent.remove();
    }

    let favoritesPanel = document.getElementById('favorites-panel');
    if (favoritesPanel.childElementCount === 1) {
      favoritesPanel.remove();
    }
    // 保存收藏夹信息
    await this.saveFavoritesInfoToLocal();
  }

  /** 重命名时操作收藏夹
   * @param {string} id 文档 id
   * @param {string} name 文档名称
  */
  updateFavoriteWhenRename(id, name) {
    console.log('renameFavoriteById', id, name);
    let favoritesPanel = document.getElementById('favorites-panel');
    if (favoritesPanel === null || favoritesPanel === undefined) {
      return;
    }
    let ulElements = favoritesPanel.querySelectorAll('ul:not(.favorites-ignreo-item)');
    console.log('ulElements', ulElements);
    ulElements.forEach(ul => {
      const liElements = ul.querySelectorAll('li');
      liElements.forEach(li => {
        if (li.getAttribute('data-node-id') === id) {
          console.log('li', li);
          li.setAttribute('data-name', name + ".sy");
          li.querySelector('.b3-list-item__text').innerText = name;
          console.log('li', li);
        }
      });
    });
  }

  /** 更新图标
   * @param {string} id 文档 id
   * @param {string} icon 文档图标
  */
  async updateIconWhenTransactions(id, icon) {
    console.log('updateIconWhenTransactions', id, icon);
    let favoritesPanel = document.getElementById('favorites-panel');
    if (favoritesPanel === null || favoritesPanel === undefined) {
      return;
    }
    let ulElements = favoritesPanel.querySelectorAll('ul:not(.favorites-ignreo-item)');
    console.log('ulElements', ulElements);
    ulElements.forEach(ul => {
      const liElements = ul.querySelectorAll('li');
      liElements.forEach(li => {
        if (li.getAttribute('data-node-id') === id) {
          console.log('li', li);
          // 获取 span 为 .b3-list-item__icon 并设置图标
          let iconSpan = li.querySelector('.b3-list-item__icon');
          iconSpan.textContent = String.fromCodePoint(parseInt(icon, 16));
          console.log('li', li);
        }
      });
    });
  }

  /** 保存收藏夹信息到本地 */
  async saveFavoritesInfoToLocal() {
    console.log('saveFavoritesInfoToLocal');
    let favoritesPanel = document.getElementById('favorites-panel');
    let ulElements = [];
    let favoritesData = [];
    if (!favoritesPanel) {
      // 如果不存在就保存 
      favoritesData = [];
    } else {
      // 如果存在就保存列表中的
      ulElements = favoritesPanel.querySelectorAll('ul:not(.favorites-ignreo-item)');
      ulElements.forEach(ul => {
        // 获取是 li 的子元素
        const liElements = ul.querySelectorAll('li[pg-favorites="1"]');
        liElements.forEach(li => {
          let pgFavorites = li.hasAttribute('pg-favorites') ? li.getAttribute('pg-favorites') : 0;
          if (li.getAttribute('data-node-id')) {
            favoritesData.push({
              id: li.getAttribute('data-node-id'),
              pgFavorites: pgFavorites,
              path: li.getAttribute('data-path'),
              notebook: li.getAttribute('data-url'),
              name: li.getAttribute('data-name'),
              count: li.getAttribute('data-count'),
              icon: li.querySelector('.b3-list-item__icon')?.textContent || '📄'
            });
          }
        });
      });

    }
    try {
      const formData = new FormData();
      const blob = new Blob([JSON.stringify(favoritesData, null, 2)]);
      const file = new File([blob], 'favorites.json');
      formData.append('path', this.savePath);
      formData.append('file', file);
      formData.append('isDir', false);
      formData.append('modTime', Date.now());

      await fetch('/api/file/putFile', {
        method: 'POST',
        body: formData
      });
    } catch (error) {
      console.error('保存收藏夹信息失败:', error);
    }
  }


  /** 从本地加载收藏夹信息 */
  async loadFavoritesInfoFromLocal() {
    console.log('loadFavoritesInfoFromLocal');
    try {
      const response = await fetch('/api/file/getFile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: this.savePath
        })
      });

      if (!response.ok) {
        console.log('收藏夹配置文件不存在，将创建新的收藏夹');
        this.saveFavoritesInfoToLocal();
        return;
      }

      const data = await response.json();
      if (data.code === 404 || data.length === 0) return;
      console.log('data', data);

      let favoritesPanel = document.getElementById('favorites-panel');
      if (!favoritesPanel) {
        favoritesPanel = this.createFavoritesPanel();
      }
      for (const item of data) {
        const li = this.createFavoriteItem(
          item.id,
          item.path,
          item.notebook,
          item.name,
          item.count,
          0,
          item.icon
        );
        if (item.hasOwnProperty('pgFavorites') && item.pgFavorites === '1') {
          li.setAttribute('pg-favorites', item.pgFavorites);
        }
        const ul = this.createUl();
        ul.appendChild(li);
        favoritesPanel.appendChild(ul);

        // 添加删除按钮
        const span = document.createElement('span');
        span.className = 'b3-list-item__action b3-tooltips b3-tooltips__w';
        span.innerHTML = `<svg><use xlink:href="#iconTrashcan"></use></svg>`;
        span.setAttribute('data-type', 'remove');
        span.setAttribute('aria-label', '删除');
        span.addEventListener('click', async (event) => {
          event.stopPropagation();
          this.removeFavoritesPage(li);
        });
        li.appendChild(span);

        // 添加展开/折叠功能
        const toggle = li.querySelector('.b3-list-item__toggle');
        const arrowIcon = toggle.querySelector('.b3-list-item__arrow');
        // let isExpanded = false;

        toggle.addEventListener('click', async (event) => {
          event.stopPropagation();
          // isExpanded = !isExpanded;
          console.log('toggle click');
          if (!arrowIcon.classList.contains('b3-list-item__arrow--open')) {
            arrowIcon.classList.add('b3-list-item__arrow--open');
            await this.loadChildBlocks(li,null,0);
          } else {
            arrowIcon.classList.remove('b3-list-item__arrow--open');
            const nextSibling = li.nextElementSibling;
            if (nextSibling && nextSibling.classList.contains('b3-list')) {
              nextSibling.remove();
            }
          }
        });
      }
    } catch (error) {
      console.error('加载收藏夹信息失败:', error);
    }
  }

  /** 当删除文档时，更新收藏夹
   * @param {string} id 文档 id
  */
  async updateFavoriteWhenRemoveDoc(id) {
    console.log('updateFavoriteWhenRemoveDoc', id);
    // 获取等待删除的路径信息
    let info = await this.getPathById(id);
    console.log('info', info);
    await this.updateFavoriteWhenRemoveOrAddDocCall(id, info.notebook, info.parentid, false);
  }


  /** 当新增文档时，更新收藏夹
   * @param {string} id 文档 id
  */
  async updateFavoriteWhenAddDoc(id) {
    console.log('updateFavoriteWhenAddDoc', id);
    // 获取等待删除的路径信息
    let info = await this.getPathById(id);
    console.log('info1', info);
    await this.updateFavoriteWhenRemoveOrAddDocCall(id, info.notebook, info.parentid, true);
  }


  /** 当删除或新增文档时，更新收藏夹
   * @param {string} id 文档 id
   * @param {string} notebook 笔记本
   * @param {string} parentid 父节点 id
   * @param {boolean} isAdd 是否新增
  */
  async updateFavoriteWhenRemoveOrAddDocCall(id, notebook, parentid, isAdd, notMoveFavId = false) {
    console.log('info22', id, notebook, parentid, isAdd);
    let favoritesPanel = document.getElementById('favorites-panel');
    // 如果没有面板则退出
    if (favoritesPanel === null || favoritesPanel === undefined) {
      return;
    }

    let ulElements = favoritesPanel.querySelectorAll('ul:not(.favorites-ignreo-item)');
    if (ulElements.length === 0) {
      return;
    }

    ulElements.forEach(ul => {

      const liElements = ul.querySelectorAll('li[data-url="' + notebook + '"]');
      if (liElements === null || liElements === undefined || liElements.length === 0) {
        return;
      }

      console.log('liElements', liElements);
      console.log('parentid', parentid);

      liElements.forEach(async li => {

        if (isAdd) {
          console.log("parentid-isAdd",parentid);
          console.log("data-node-id-isAdd",li.getAttribute('data-node-id'));
            // 如果找到了直接的父节点
            if (li.getAttribute('data-node-id') === parentid) {
              await this.setLiCount(li,true);
              // 如果是展开状态就折叠
              let toggle = li.querySelector('.b3-list-item__toggle'); 
              const arrowIcon = toggle.querySelector('.b3-list-item__arrow');
              // 如果 arrowIcon 包含 b3-list-item__arrow--open 就触发点击
              if (arrowIcon.classList.contains('b3-list-item__arrow--open')) {
                toggle.click(); 
              }
            }

        } else {
          // 如果找到了直接的父节点
          if (li.getAttribute('data-node-id') === parentid) {
            await this.setLiCount(li, isAdd);
            // if (isAdd) {
            //   // 如果是展开状态就折叠
            //   let toggle = li.querySelector('.b3-list-item__toggle');
            //   const arrowIcon = toggle.querySelector('.b3-list-item__arrow');
            //   // 如果 arrowIcon 包含 b3-list-item__arrow--open 就触发点击
            //   if (arrowIcon.classList.contains('b3-list-item__arrow--open')) {
            //     toggle.click();
            //   }
            // }
          }

          // 如果找到了自己就退出
          if (li.getAttribute('data-node-id') === id && !isAdd) {
            // console.log('li', li);
            if (notMoveFavId) {
              if (li.hasAttribute('pg-favorites') && li.getAttribute('pg-favorites') === '1') {
                // 如果是pg-favorites，且没有移除，说明应该更新 data-url
              } else {
                // 否则正常移除
                this.removeFavoritesPage(li);
              }
            } else {
              this.removeFavoritesPage(li);
            }
            // this.removeFavoritesPage(li);
          }

          // // 如果是折叠状态
          // if (li.getAttribute('data-node-id') === id && isAdd && notMoveFavId) {
          //   li.setAttribute('data-url', notebook);
          // }

        }
      });
    });
  }
  /** 设置 li 的子文档数量
   * @param {HTMLElement} li 列表项
   * @param {boolean} isAdd 是否新增
  */
  async setLiCount(li, isAdd = false) {
    // let count = await this.getSubFileCountById(li.getAttribute('data-node-id'));
    let count = parseInt(li.getAttribute('data-count'));
    if (isAdd) {
      count++;
    } else {
      count--;
      if (count < 0) {
        count = 0;
      }
    }
    li.setAttribute('data-count', count);
    console.log('set li count', count);

    // 如果 count 为 0，获取 li 的 class="b3-list-item__toggle b3-list-item__toggle--hl" 的孩子节点，并追求 fn__hidden 到 class 中
    if (count === 0) {
      let toggle = li.querySelector('.b3-list-item__toggle');
      toggle.classList.add('fn__hidden');
    } else {
      let toggle = li.querySelector('.b3-list-item__toggle');
      toggle.classList.remove('fn__hidden');
    }
  }

  /** 查找父节点
   * @param {HTMLElement} li 列表项
   * @returns {HTMLElement} 父节点
  */
  findParentFavoriteLi(li) {
    let currentElement = li.parentElement;
    while (currentElement) {
      const previousElement = currentElement.previousElementSibling;
      if (previousElement && previousElement.tagName === 'LI' && previousElement.hasAttribute('pg-favorites')) {
        return previousElement;
      }
      if (currentElement.tagName === 'DIV' || (previousElement && previousElement.tagName === 'DIV')) {
        return null;
      }
      currentElement = currentElement.parentElement;
    }
    return null;
  }


  /**
   * 根据id获取路径信息
   * @param {*} id 
   * @returns {notebook: 笔记本id, rootid: 根节点id, parentid: 父节点id}
   */
  async getPathById(id) {
    const response = await fetch('/api/filetree/getPathByID', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id })
    });

    console.log("response-getPathById", response);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.code === -1) {

      console.log('getPathById', data);
      // window.siyuan.config.system.dataDir
      const pathMatch = data.msg.match(/open (.*\.sy):/);
      if (pathMatch && pathMatch[1]) {
        const extractedPath = pathMatch[1];
        console.log('window.siyuan.config.system.dataDir', window.siyuan.config.system.dataDir);
        console.log('提取的路径:', extractedPath);

        // extractedPath 中排除 window.siyuan.config.system.dataDir 的值，并且通过 / 拆分成数组
        const dataDir = window.siyuan.config.system.dataDir;
        const pathSegments = extractedPath.replace(dataDir, '').split('\\');
        console.log('pathSegments', pathSegments);

        // 如果第一个元素为空，则移除第一个元素
        if (pathSegments[0] === '' || pathSegments[0] === undefined || pathSegments[0] === null) {
          console.log('pathSegments[0] is empty');
          pathSegments.shift(); // 移除第一个元素
        }
        // 获取值后移除
        const notebook = pathSegments[0]; // 获取笔记本id
        console.log('notebook', notebook);
        pathSegments.shift(); // 移除第一个元素
        const firstSegment = pathSegments[0]; // 获取根节点id
        console.log('firstSegment-pathSegments', pathSegments);
        const secondLastSegment = pathSegments.length > 1 ? pathSegments[pathSegments.length - 2] : null; // 获取父节点id

        let rst = {
          notebook: notebook,
          rootid: firstSegment,
          parentid: secondLastSegment
        };
        return rst;

      } else {
        console.error('未能从消息中提取路径');
        return null;
      }
    } else {

      console.log('getPathById', data);
      const pathSegments = data.data.path.split('/');
      console.log('pathSegments', pathSegments);
      const firstSegment = pathSegments[0];
      const secondLastSegment = pathSegments.length > 1 ? pathSegments[pathSegments.length - 2] : null;
      console.log('secondLastSegment', secondLastSegment);

      let rst = {
        notebook: data.data.notebook,
        rootid: firstSegment,
        parentid: secondLastSegment
      };
      return rst;
    }

  }

  /** 获取文档的子文档数量
   * @param {string} id 文档 id
   * @returns {number} 子文档数量
  */
  async getSubFileCountById(id) {
    try {
      const response = await fetch('/api/block/getDocInfo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.code === 0) {
        return data.data.subFileCount;
      } else {
        console.error('获取文档信息失败:', data.msg);
        return null;
      }
    } catch (error) {
      console.error('请求失败:', error);
      return null;
    }
  }
}