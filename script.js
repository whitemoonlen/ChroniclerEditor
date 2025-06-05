// 初始化 tiktoken 編碼器
let tiktokenEncoding = null;

function initTiktoken() {
    if (!tiktokenEncoding) {
        try {
            // 改為 o200k_base（GPT-4o 使用的編碼）
            tiktokenEncoding = getEncoding('o200k_base');
        } catch (error) {
            console.error('tiktoken 編碼器初始化失敗:', error);
        }
    }
    return tiktokenEncoding;
}

// ===== 翻譯 =====
let currentLang = localStorage.getItem('characterCreatorLang') || 'zh';
let translationsReady = false;

// 翻譯函數
function t(key, ...args) {
    if (!window.translationManager) {
        console.warn('⚠️ 翻譯管理器尚未初始化，使用鍵值:', key);
        return key;
    }
    
    const locale = currentLang === 'zh' ? 'zh-TW' : 'en-US';
    const result = window.translationManager.getTranslation(locale, key, ...args);
    
    // 調試日誌（開發時可啟用）
    if (result === key && key.length > 2) {
        console.debug(`🔍 翻譯查找: ${locale}.${key} = ${result}`);
    }
    
    return result;
}

// 初始化翻譯系統（增強版）
async function initTranslations() {
    if (!window.translationManager) {
        console.error('❌ 翻譯管理器未找到，請確保已載入 translations/index.js');
        return false;
    }
    
    const locale = currentLang === 'zh' ? 'zh-TW' : 'en-US';
    
    try {
        const success = await window.translationManager.loadLanguage(locale);
        if (success) {
            translationsReady = true;
            
            // 驗證翻譯是否正確載入
            const testTranslation = window.translationManager.getTranslation(locale, 'appTitle');
            
            return true;
        } else {
            console.warn(`⚠️ 翻譯載入失敗，使用備援翻譯 (${locale})`);
            translationsReady = true; // 使用備援翻譯
            return false;
        }
    } catch (error) {
        console.error('❌ 翻譯系統初始化失敗:', error);
        translationsReady = true; // 使用備援翻譯
        return false;
    }
}

// 切換語言
async function switchLanguage(newLang) {
    if (newLang === currentLang) return;
    
    currentLang = newLang;
    localStorage.setItem('characterCreatorLang', newLang);
    
    const locale = newLang === 'zh' ? 'zh-TW' : 'en-US';
    
    if (window.translationManager) {
        const success = await window.translationManager.loadLanguage(locale);
    }
    
    // 重新渲染界面
    if (typeof renderAll === 'function') {
        renderAll();
    }
}

// 變數宣告
let characters = [];
let isHomePage = true;
let currentCharacterId = null;
let currentVersionId = null;
let viewMode = 'single';
let sidebarCollapsed = false;
let compareVersions = [];
let hasUnsavedChanges = false;
let lastSavedData = null;
let customSections = [];
let worldBooks = [];
let currentMode = 'character';
let currentWorldBookId = null;
let currentWorldBookVersionId = null;
let currentCustomSectionId = null;
let currentCustomVersionId = null;

// 主題配色 - 日間
const themes = {
    classic: { primary: '#4E5E79', secondary: '#1a202c', accent: '#8b7355', bg: '#f7f5f3' },
    warm: { primary: '#744210', secondary: '#553c9a', accent: '#d69e2e', bg: '#fefcf0' },
    cool: { primary: '#2c5282', secondary: '#2a4365', accent: '#3182ce', bg: '#f0f8ff' },
    forest: { primary: '#22543d', secondary: '#1a202c', accent: '#38a169', bg: '#f0fff4' },
    vintage: { primary: '#553c9a', secondary: '#44337a', accent: '#9f7aea', bg: '#faf5ff' },
    minimal: { primary: '#4a5568', secondary: '#2d3748', accent: '#718096', bg: '#f8f9fa' }
};

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

        // IndexedDB 管理器
class CharacterDB {
    constructor() {
        this.db = null;
        this.dbName = 'CharacterCreatorDB';
        this.version = 1;
        this.isSupported = 'indexedDB' in window;
    }

    // 初始化資料庫
    async init() {
        if (!this.isSupported) {
            console.log('IndexedDB 不支援，使用 localStorage');
            return false;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                console.error('IndexedDB 開啟失敗，降級到 localStorage');
                resolve(false);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(true);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // 創建角色表格
                if (!db.objectStoreNames.contains('characters')) {
                    const characterStore = db.createObjectStore('characters', { keyPath: 'id' });
                    characterStore.createIndex('name', 'name', { unique: false });
                }
                
                // 創建自定義區塊表格
                if (!db.objectStoreNames.contains('customSections')) {
                    const customStore = db.createObjectStore('customSections', { keyPath: 'id' });
                    customStore.createIndex('name', 'name', { unique: false });
                }
                
                // 創建世界書表格
                if (!db.objectStoreNames.contains('worldBooks')) {
                    const worldBookStore = db.createObjectStore('worldBooks', { keyPath: 'id' });
                    worldBookStore.createIndex('name', 'name', { unique: false });
                }

                // 創建設定表格
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }

    // 儲存角色資料
    async saveCharacters(charactersData) {
        if (!this.db) return this.fallbackSave('characterCreatorData', charactersData);

        try {
            const transaction = this.db.transaction(['characters'], 'readwrite');
            const store = transaction.objectStore('characters');
            
            // 清空現有資料
            await this.clearStore(store);
            
            // 存入新資料
            for (const character of charactersData) {
                await this.addToStore(store, character);
            }
            
            return true;
        } catch (error) {
            console.error('IndexedDB 儲存失敗，使用 localStorage:', error);
            return this.fallbackSave('characterCreatorData', charactersData);
        }
    }

    // 載入角色資料
    async loadCharacters() {
        if (!this.db) return this.fallbackLoad('characterCreatorData');

        try {
            const transaction = this.db.transaction(['characters'], 'readonly');
            const store = transaction.objectStore('characters');
            const result = await this.getAllFromStore(store);
            return result || [];
        } catch (error) {
            console.error('IndexedDB 載入失敗，使用 localStorage:', error);
            return this.fallbackLoad('characterCreatorData');
        }
    }

    // 儲存自定義區塊
    async saveCustomSections(customData) {
        if (!this.db) return this.fallbackSave('characterCreatorCustomData', customData);

        try {
            const transaction = this.db.transaction(['customSections'], 'readwrite');
            const store = transaction.objectStore('customSections');
            
            await this.clearStore(store);
            for (const section of customData) {
                await this.addToStore(store, section);
            }
            return true;
        } catch (error) {
            console.error('IndexedDB 儲存自定義資料失敗:', error);
            return this.fallbackSave('characterCreatorCustomData', customData);
        }
    }

    // 載入自定義區塊
    async loadCustomSections() {
        if (!this.db) return this.fallbackLoad('characterCreatorCustomData');

        try {
            const transaction = this.db.transaction(['customSections'], 'readonly');
            const store = transaction.objectStore('customSections');
            return await this.getAllFromStore(store) || [];
        } catch (error) {
            console.error('IndexedDB 載入自定義資料失敗:', error);
            return this.fallbackLoad('characterCreatorCustomData');
        }
    }

    // 儲存世界書
    async saveWorldBooks(worldBooksData) {
        if (!this.db) return this.fallbackSave('characterCreatorWorldBooks', worldBooksData);

        try {
            const transaction = this.db.transaction(['worldBooks'], 'readwrite');
            const store = transaction.objectStore('worldBooks');
            
            await this.clearStore(store);
            for (const worldBook of worldBooksData) {
                await this.addToStore(store, worldBook);
            }
            return true;
        } catch (error) {
            console.error('IndexedDB 儲存世界書失敗:', error);
            return this.fallbackSave('characterCreatorWorldBooks', worldBooksData);
        }
    }

    // 載入世界書
    async loadWorldBooks() {
        if (!this.db) return this.fallbackLoad('characterCreatorWorldBooks');

        try {
            const transaction = this.db.transaction(['worldBooks'], 'readonly');
            const store = transaction.objectStore('worldBooks');
            return await this.getAllFromStore(store) || [];
        } catch (error) {
            console.error('IndexedDB 載入世界書失敗:', error);
            return this.fallbackLoad('characterCreatorWorldBooks');
        }
    }

    // 工具函數：清空表格
    clearStore(store) {
        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // 工具函數：添加到表格
    addToStore(store, data) {
        return new Promise((resolve, reject) => {
            const request = store.add(data);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // 工具函數：取得所有資料
    getAllFromStore(store) {
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // 降級到 localStorage
    fallbackSave(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('localStorage 也儲存失敗:', error);
            return false;
        }
    }

    fallbackLoad(key) {
        try {
            const saved = localStorage.getItem(key);
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error('localStorage 載入失敗:', error);
            return [];
        }
    }

    // 計算 IndexedDB 使用量
    async getStorageEstimate() {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            try {
                const estimate = await navigator.storage.estimate();
                return {
                    used: Math.round(estimate.usage / 1024 / 1024), // MB
                    total: Math.round(estimate.quota / 1024 / 1024), // MB
                    available: Math.round((estimate.quota - estimate.usage) / 1024 / 1024) // MB
                };
            } catch (error) {
                return null;
            }
        }
        return null;
    }

    // 遷移 localStorage 資料到 IndexedDB
    async migrateFromLocalStorage() {
        if (!this.db) return false;

        try {
            console.log('正在遷移 localStorage 資料到 IndexedDB...');
            
            // 遷移角色資料
            const oldCharacters = this.fallbackLoad('characterCreatorData');
            if (oldCharacters.length > 0) {
                await this.saveCharacters(oldCharacters);
                console.log(`遷移了 ${oldCharacters.length} 個角色`);
            }

            // 遷移自定義區塊
            const oldCustom = this.fallbackLoad('characterCreatorCustomData');
            if (oldCustom.length > 0) {
                await this.saveCustomSections(oldCustom);
                console.log(`遷移了 ${oldCustom.length} 個自定義區塊`);
            }

            // 遷移世界書
            const oldWorldBooks = this.fallbackLoad('characterCreatorWorldBooks');
            if (oldWorldBooks.length > 0) {
                await this.saveWorldBooks(oldWorldBooks);
                console.log(`遷移了 ${oldWorldBooks.length} 個世界書`);
            }

            // 標記已遷移
            const transaction = this.db.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');
            await this.addToStore(store, { key: 'migrated', value: true, date: new Date().toISOString() });

            console.log('資料遷移完成！');
            return true;
        } catch (error) {
            console.error('資料遷移失敗:', error);
            return false;
        }
    }

    // 檢查是否已遷移
    async checkMigrationStatus() {
        if (!this.db) return false;

        try {
            const transaction = this.db.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');
            const request = store.get('migrated');
            
            return new Promise((resolve) => {
                request.onsuccess = () => {
                    resolve(!!request.result);
                };
                request.onerror = () => resolve(false);
            });
        } catch (error) {
            return false;
        }
    }
}

// 創建全域 DB 實例
const characterDB = new CharacterDB();

// ===== 語言相關函數更新 =====
function selectLanguage(lang) {
    switchLanguage(lang);
    
    // 隱藏選單
    document.getElementById('lang-menu').style.display = 'none';
    
    // 更新語言按鈕提示
    const langToggle = document.getElementById('lang-toggle');
    if (langToggle) {
        langToggle.title = lang === 'zh' ? '切換語言 (繁體中文)' : 'Switch Language (English)';
    }
}

function toggleLanguageMenu() {
    const menu = document.getElementById('lang-menu');
    const isVisible = menu.style.display !== 'none';
    
    if (isVisible) {
        menu.style.display = 'none';
    } else {
        menu.style.display = 'block';
        updateLanguageMenu();
    }
}

function updateLanguageMenu() {
    const options = document.querySelectorAll('.language-option');
    options.forEach(option => {
        const lang = option.getAttribute('onclick').match(/'(.+)'/)[1];
        if (lang === currentLang) {
            option.classList.add('active');
        } else {
            option.classList.remove('active');
        }
    });
}


function toggleItemVersions(type, itemId) {
    const isCurrentItem = (currentMode === type && ItemManager.getCurrentItemId() === itemId);

    if (!isCurrentItem) {
        switchToItem(type, itemId);
        renderAll();
        
        // 🆕 新增：切換項目後自動展開版本列表
        setTimeout(() => {
            const versionsList = document.getElementById(`${type}-versions-${itemId}`);
            const expandIcon = document.querySelector(`[onclick="toggleItemVersions('${type}', '${itemId}')"] .expand-icon`);
            
            if (versionsList && expandIcon) {
                versionsList.classList.add('expanded');
                expandIcon.innerHTML = '<span class="arrow-icon arrow-down"></span>';
            }
        }, 100); // 等待渲染完成後再展開
        
        return;
    }
    
    // 如果是當前項目，則切換展開/收合狀態
    const versionsList = document.getElementById(`${type}-versions-${itemId}`);
    const expandIcon = document.querySelector(`[onclick="toggleItemVersions('${type}', '${itemId}')"] .expand-icon`);
    
    if (!versionsList || !expandIcon) return;
    
    const isCurrentlyExpanded = versionsList.classList.contains('expanded');
    
    if (isCurrentlyExpanded) {
        versionsList.classList.remove('expanded');
        expandIcon.innerHTML = '<span class="arrow-icon arrow-right"></span>'; 
    } else {
        versionsList.classList.add('expanded');
        expandIcon.innerHTML = '<span class="arrow-icon arrow-down"></span>'; 
    }
}

// 統一的項目切換函數
function switchToItem(type, itemId) {
    currentMode = type;
    viewMode = 'single';
    compareVersions = [];
    
    switch (type) {
        case 'character':
            currentCharacterId = itemId;
            const character = characters.find(c => c.id === itemId);
            if (character) {
                currentVersionId = character.versions[0].id;
            }
            break;
            
        case 'custom':
            currentCustomSectionId = itemId;
            const section = customSections.find(s => s.id === itemId);
            if (section) {
                currentCustomVersionId = section.versions[0].id;
            }
            break;
            
        case 'worldbook':
            currentWorldBookId = itemId;
            const worldBook = worldBooks.find(wb => wb.id === itemId);
            if (worldBook) {
                currentWorldBookVersionId = worldBook.versions[0].id;
            }
            break;
    }

    // 新增：防止閃現的預處理
    const versionsList = document.getElementById(`${type}-versions-${itemId}`);
    if (versionsList) {
        versionsList.style.transition = 'none'; // 暫時禁用動畫
        setTimeout(() => {
            if (versionsList) {
                versionsList.style.transition = ''; // 恢復動畫
            }
        }, 100);
    }
}

            // 統一的項目管理器
class ItemManager {
    // 獲取當前項目
    static getCurrentItem() {
        const itemId = this.getCurrentItemId();
        const items = this.getItemsArray(currentMode);
        return items.find(item => item.id === itemId);
    }
    
    // 獲取當前項目ID
    static getCurrentItemId() {
        switch (currentMode) {
            case 'character': return currentCharacterId;
            case 'custom': return currentCustomSectionId;
            case 'worldbook': return currentWorldBookId;
            default: return null;
        }
    }
    
    // 獲取當前版本ID
    static getCurrentVersionId() {
        switch (currentMode) {
            case 'character': return currentVersionId;
            case 'custom': return currentCustomVersionId;
            case 'worldbook': return currentWorldBookVersionId;
            default: return null;
        }
    }
    
    // 獲取項目陣列
    static getItemsArray(type) {
        switch (type) {
            case 'character': return characters;
            case 'custom': return customSections;
            case 'worldbook': return worldBooks;
            default: return [];
        }
    }
    
    // 獲取當前版本
    static getCurrentVersion() {
        const item = this.getCurrentItem();
        const versionId = this.getCurrentVersionId();
        return item?.versions.find(v => v.id === versionId);
    }
    
    // 設置當前項目
    static setCurrentItem(type, itemId, versionId = null) {
        currentMode = type;
        
        switch (type) {
            case 'character':
                currentCharacterId = itemId;
                if (versionId) currentVersionId = versionId;
                break;
            case 'custom':
                currentCustomSectionId = itemId;
                if (versionId) currentCustomVersionId = versionId;
                break;
            case 'worldbook':
                currentWorldBookId = itemId;
                if (versionId) currentWorldBookVersionId = versionId;
                break;
        }
    }
}

// 統一的資料操作層
class DataOperations {
    // 獲取項目陣列的統一接口
    static getItems(type) {
        switch (type) {
            case 'character': return characters;
            case 'custom': return customSections;
            case 'worldbook': return worldBooks;
            default: return [];
        }
    }

    // 創建新項目的統一邏輯
    static createNewItem(type, index = 0) {
        const baseId = generateId();
        const baseVersionId = generateId();
        
        const baseStructure = {
            id: baseId,
            versions: [{
                id: baseVersionId,
                name: 'Version 1'
            }]
        };

        switch (type) {
            case 'character':
                return {
                    ...baseStructure,
                    name: `Character ${index + 1}`,
                    versions: [{
                        ...baseStructure.versions[0],
                        avatar: '',
                        description: '',
                        personality: '',
                        scenario: '',
                        dialogue: '',
                        firstMessage: '',
                        creator: '',
                        charVersion: '',
                        creatorNotes: '',
                        tags: '',
                        createdAt: TimestampManager.createTimestamp(),
                        updatedAt: TimestampManager.createTimestamp()
                    }]
                };
                
            case 'worldbook':
                return {
                    ...baseStructure,
                    name: `Lorebook ${index + 1}`,
                    description: '',
                    versions: [{
                        ...baseStructure.versions[0],
                        entries: [],
                        createdAt: TimestampManager.createTimestamp(),
                        updatedAt: TimestampManager.createTimestamp()
                    }]
                };
                
            case 'custom':
                return {
                    ...baseStructure,
                    name: `Notebook ${index + 1}`,
                    versions: [{
                        ...baseStructure.versions[0],
                        fields: [{
                            id: generateId(),
                            name: 'Field 1',
                            content: '',
                            createdAt: TimestampManager.createTimestamp(),
                            updatedAt: TimestampManager.createTimestamp()
                        }]
                    }]
                };
        }
    }

    // 創建新版本的統一邏輯
    static createNewVersion(type, versionNumber) {
        const baseVersion = {
            id: generateId(),
            name: `Version ${versionNumber}`
        };

        switch (type) {
            case 'character':
                return {
                    ...baseVersion,
                    avatar: '',
                    description: '',
                    personality: '',
                    scenario: '',
                    dialogue: '',
                    firstMessage: '',
                    creator: '',
                    charVersion: '',
                    creatorNotes: '',
                    tags: '',
                    createdAt: TimestampManager.createTimestamp(),
                    updatedAt: TimestampManager.createTimestamp()
                };
                
            case 'worldbook':
                return {
                    ...baseVersion,
                    entries: [],
                     createdAt: TimestampManager.createTimestamp(),
                    updatedAt: TimestampManager.createTimestamp()
                };
                
            case 'custom':
                return {
                    ...baseVersion,
                    fields: [{
                        id: generateId(),
                        name: 'Default Field',
                        content: '',
                         createdAt: TimestampManager.createTimestamp(),
                    updatedAt: TimestampManager.createTimestamp()
                    }]
                };
        }
    }

    // 深拷貝版本的統一邏輯
    static cloneVersion(originalVersion, type) {
        const baseClone = {
            id: generateId(),
            name: originalVersion.name
        };
        
        switch (type) {
            case 'character':
                return {
                    ...baseClone,
                    avatar: originalVersion.avatar || '',
                    description: originalVersion.description || '',
                    personality: originalVersion.personality || '',
                    scenario: originalVersion.scenario || '',
                    dialogue: originalVersion.dialogue || '',
                    firstMessage: originalVersion.firstMessage || '',
                    creator: originalVersion.creator || '',
                    charVersion: originalVersion.charVersion || '',
                    creatorNotes: originalVersion.creatorNotes || '',
                    tags: originalVersion.tags || ''
                };
                
            case 'worldbook':
                return {
                    ...baseClone,
                    entries: originalVersion.entries.map(entry => ({
                        ...entry,
                        id: generateId()
                    }))
                };
                
            case 'custom':
                return {
                    ...baseClone,
                    fields: originalVersion.fields.map(field => ({
                        id: generateId(),
                        name: field.name,
                        content: field.content
                    }))
                };
        }
    }

    // 獲取類型顯示名稱
    static getTypeDisplayName(type) {
        switch (type) {
            case 'character': return { zh: '角色', en: 'Character' };
            case 'worldbook': return { zh: '世界書', en: 'Lorebook' };
            case 'custom': return { zh: '筆記', en: 'Notebook' };
            default: return { zh: '項目', en: 'Item' };
        }
    }

    // 獲取刪除確認訊息
    static getDeleteConfirmMessage(type, itemName) {
        const messages = {
            character: {
                zh: `確定要刪除角色「${itemName}」嗎？\n\n⚠️ 刪除後無法復原，請確保已備份重要資料！`,
                en: `Are you sure you want to delete character "${itemName}"?\n\n⚠️ This cannot be undone. Please ensure you have backed up important data!`
            },
            worldbook: {
                zh: `確定要刪除世界書「${itemName}」嗎？\n\n⚠️ 刪除後無法復原，請確保已備份重要資料！`,
                en: `Are you sure you want to delete lorebook "${itemName}"?\n\n⚠️ This cannot be undone. Please ensure you have backed up important data!`
            },
            custom: {
                zh: `確定要刪除筆記「${itemName}」嗎？\n\n⚠️ 刪除後無法復原，請確保已備份重要資料！`,
                en: `Are you sure you want to delete notebook "${itemName}"?\n\n⚠️ This cannot be undone. Please ensure you have backed up important data!`
            }
        };
        
        return messages[type][currentLang] || messages[type].zh;
    }
}

 // 統一的CRUD操作
class ItemCRUD {
    // 新增項目
    static add(type) {
        isHomePage = false;
        const itemsArray = DataOperations.getItems(type);
        const newItem = DataOperations.createNewItem(type, itemsArray.length);
        
        itemsArray.push(newItem);
        ItemManager.setCurrentItem(type, newItem.id, newItem.versions[0].id);
        
        renderAll();
        markAsChanged();
        return newItem;
    }
    
    // 刪除項目
    static remove(type, itemId) {
        const itemsArray = DataOperations.getItems(type);
        const item = itemsArray.find(i => i.id === itemId);
        
        if (!item) return false;
        
        const confirmDelete = confirm(DataOperations.getDeleteConfirmMessage(type, item.name));
        
        if (confirmDelete) {
            const index = itemsArray.findIndex(i => i.id === itemId);
            if (index > -1) {
                itemsArray.splice(index, 1);
            }
            
            this.updateCurrentAfterDelete(type, itemId);
            renderAll();
            saveData();
            return true;
        }
        
        return false;
    }
    
    // 複製項目
    static copy(type, itemId) {
        const itemsArray = DataOperations.getItems(type);
        const originalItem = itemsArray.find(i => i.id === itemId);
        
        if (!originalItem) return null;
        
        const newItem = this.cloneItem(originalItem, type);
        itemsArray.push(newItem);
        
        ItemManager.setCurrentItem(type, newItem.id, newItem.versions[0].id);
        
        renderAll();
        markAsChanged();
        return newItem;
    }
    
    // 克隆項目
    static cloneItem(originalItem, type) {
        const newItem = {
            id: generateId(),
            name: originalItem.name + ' - Copy',
            versions: originalItem.versions.map(version => DataOperations.cloneVersion(version, type))
        };
        
        // 複製類型特定的屬性
        if (type === 'worldbook' && originalItem.description) {
            newItem.description = originalItem.description;
        }
        
        return newItem;
    }
    
    // 刪除後更新當前選擇
    static updateCurrentAfterDelete(type, deletedItemId) {
        const currentItemId = ItemManager.getCurrentItemId();
        
        if (currentItemId === deletedItemId) {
            const itemsArray = DataOperations.getItems(type);
            
            if (itemsArray.length > 0) {
                ItemManager.setCurrentItem(type, itemsArray[0].id, itemsArray[0].versions[0].id);
            } else {
                this.resetToHomePage(type);
            }
        }
    }
    
    // 重置到首頁狀態
    static resetToHomePage(type) {
        if (type === 'character') {
            isHomePage = true;
            currentCharacterId = null;
            currentVersionId = null;
        } else if (type === 'custom') {
            currentMode = 'character';
            currentCustomSectionId = null;
            currentCustomVersionId = null;
        } else if (type === 'worldbook') {
            currentMode = 'character';
            currentWorldBookId = null;
            currentWorldBookVersionId = null;
        }
    }
}

 // 統一版本管理
class VersionCRUD {
    // 新增版本
    static add(type, itemId) {
        const item = DataOperations.getItems(type).find(i => i.id === itemId);
        if (!item) return null;
        
        const newVersion = DataOperations.createNewVersion(type, item.versions.length + 1);
        item.versions.push(newVersion);
        
        ItemManager.setCurrentItem(type, itemId, newVersion.id);
        
        renderAll();
        markAsChanged();
        return newVersion;
    }
    
    // 複製版本
    static copy(type, itemId, versionId) {
        const item = DataOperations.getItems(type).find(i => i.id === itemId);
        if (!item) return null;
        
        const originalVersion = item.versions.find(v => v.id === versionId);
        if (!originalVersion) return null;
        
        const newVersion = DataOperations.cloneVersion(originalVersion, type);
        newVersion.name = originalVersion.name + ' - Copy';
        
        item.versions.push(newVersion);
        ItemManager.setCurrentItem(type, itemId, newVersion.id);
        
        renderAll();
        markAsChanged();
        return newVersion;
    }
    
    // 刪除版本
    static remove(type, itemId, versionId) {
        const item = DataOperations.getItems(type).find(i => i.id === itemId);
        if (!item || item.versions.length <= 1) {
            alert(t('keepOneVersion'));
            return false;
        }
        
        const version = item.versions.find(v => v.id === versionId);
        const confirmDelete = confirm(t('deleteVersionConfirm', version?.name || '未命名版本'));
        
        if (confirmDelete) {
            const index = item.versions.findIndex(v => v.id === versionId);
            if (index > -1) {
                item.versions.splice(index, 1);
            }
            
            const currentVersionId = ItemManager.getCurrentVersionId();
            if (currentVersionId === versionId) {
                ItemManager.setCurrentItem(type, itemId, item.versions[0].id);
            }
            
            renderAll();
            saveData();
            return true;
        }
        
        return false;
    }
}

        // 統一的內容渲染器
class ContentRenderer {
   // 主要內容渲染入口
static renderMainContent() {
    const container = document.getElementById('contentArea');
    
    // 如果是首頁狀態，顯示歡迎頁面
    if (isHomePage) {
        this.renderHomePage(container);
        return;
    }
    
    const currentItem = ItemManager.getCurrentItem();
    if (!currentItem) {
        container.innerHTML = this.renderEmptyState();
        return;
    }
    
    const versionsToShow = this.getVersionsToShow(currentItem);
    
    const versionsHTML = `
<div class="versions-container ${viewMode}-view">
    ${versionsToShow.map(version => this.renderVersionPanel(currentItem, version)).join('')}
</div>
`;

container.innerHTML = `
${this.renderItemHeader(currentItem)}
${versionsHTML}
${this.renderExportSection(currentItem)}
`;
    
   setTimeout(() => {
    updateStats();
    initAutoResize();
}, 50);
}
    
    // 渲染項目標題欄
    static renderItemHeader(item) {
    const itemType = currentMode;
    const itemTypeDisplay = this.getItemTypeDisplay(itemType);
    
    return `
   <div class="character-header-bar ${viewMode}-mode">
    <div class="character-title-section">
        <input type="text" class="character-main-title-fixed" value="${item.name}" 
               onchange="updateItemName('${itemType}', '${item.id}', this.value)" 
               placeholder="${itemTypeDisplay}名稱">
    </div>
   <div class="character-controls">
    <button class="btn btn-secondary" 
            onclick="VersionCRUD.add('${itemType}', '${item.id}')"
            title="${t('addVersion')}"
            style="padding: 8px 12px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
    </button>
    
    <button class="btn btn-secondary" 
            onclick="ItemCRUD.copy('${itemType}', '${item.id}')"
            title="${this.getCopyButtonText(itemType)}"
            style="padding: 8px 12px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
    </button>
    
    <button class="btn btn-secondary" 
            onclick="ItemCRUD.remove('${itemType}', '${item.id}')"
            title="${this.getDeleteButtonText(itemType)}"
            style="padding: 8px 12px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3,6 5,6 21,6"/>
            <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"/>
            <line x1="10" y1="11" x2="10" y2="17"/>
            <line x1="14" y1="11" x2="14" y2="17"/>
        </svg>
    </button>
    
    <button class="view-toggle-switch ${viewMode === 'single' ? 'single-mode' : 'compare-mode'}" 
        onclick="toggleCompareMode()"
        style="position: relative; border: 2px solid var(--border-color); border-radius: 20px; padding: 4px; background: ${viewMode === 'single' ? 'var(--accent-color)' : 'var(--primary-color)'}; cursor: pointer; transition: all 0.3s ease; min-width: fit-content; height: 36px; display: flex; align-items: center;">
    
    <!-- 滑動的白色背景 -->
    <div class="toggle-background" 
         style="position: absolute; top: 50%; transform: translateY(-50%); height: 26px; background: white; border-radius: 16px; transition: all 0.3s ease; ${viewMode === 'single' ? 'left: 4px; width: calc(50% - 4px);' : 'right: 4px; width: calc(50% - 4px);'}"></div>
    
    <!-- 左側文字容器 (單一檢視) -->
    <div style="position: relative; z-index: 2; flex: 1; display: flex; align-items: center; justify-content: center; padding: 6px 12px; font-size: 0.9em; font-weight: 500; color: white; transition: color 0.3s ease; white-space: nowrap;">
    ${t('singleView')}
</div>
    
    <!-- 右側文字容器 (對比檢視) -->
    <div style="position: relative; z-index: 2; flex: 1; display: flex; align-items: center; justify-content: center; padding: 6px 12px; font-size: 0.9em; font-weight: 500; color: white; transition: color 0.3s ease; white-space: nowrap;">
    ${t('compareView')}
</div>
</button>
</div>
</div>
    `;
    }
    
    // 渲染版本面板
    static renderVersionPanel(item, version) {
        const itemType = currentMode;
        
        return `
            <div class="version-panel">
                ${this.renderVersionHeader(item, version, itemType)}
                ${this.renderVersionContent(item, version, itemType)}
            </div>
        `;
    }
    
static renderVersionHeader(item, version, itemType) {
    return `
        <!-- ⬇️ 外層包住標題與統計，加上分隔線 -->
        <div style="border-bottom: 1px solid var(--border-color); padding-bottom: 4px; margin-bottom: 16px;">
            
            <!-- 上方：版本標題與按鈕 -->
            <div class="version-header" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                <input type="text" class="version-title" value="${version.name}" 
    onchange="updateVersionName('${itemType}', '${item.id}', '${version.id}', this.value)"
    style="font-size: 1.2em; font-weight: 600; margin: 0; padding: 4px 12px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--text-color); transition: all 0.2s ease; flex: 1;">

    
                <div style="display: flex; gap: 8px; flex-shrink: 0;">
                    <button class="btn btn-secondary btn-small" onclick="VersionCRUD.copy('${itemType}', '${item.id}', '${version.id}')">${t('copy')}</button>
                    ${item.versions.length > 1 ? `<button class="btn btn-secondary btn-small" onclick="VersionCRUD.remove('${itemType}', '${item.id}', '${version.id}')">${t('delete')}</button>` : ''}
                </div>
            </div>

            <!-- 下方：字數統計與時間戳 -->
            <div class="version-stats" id="${itemType}-version-stats-${version.id}" 
                style="display: flex; justify-content: space-between; font-size: 0.85em; color: var(--text-muted); padding: 0 12px;">
                <span class="stats-text">${this.getVersionStatsDisplay(version, itemType)}</span>
                <span class="timestamp-text" style="font-size: 0.75em; opacity: 0.8;">${TimestampManager.formatTimestamp(version.updatedAt)}</span>
            </div>

        </div>
    `;
}






    
    // 渲染版本內容
    static renderVersionContent(item, version, itemType) {
        switch (itemType) {
            case 'character':
                return this.renderCharacterVersionContent(item, version);
            case 'worldbook':
                return this.renderWorldBookVersionContent(item, version);
            case 'custom':
                return this.renderCustomVersionContent(item, version);
            default:
                return '<div>未知的項目類型</div>';
        }
    }
    
    // 渲染角色版本內容
    static renderCharacterVersionContent(character, version) {
        return `
            <div class="character-basic-info">
                <div class="avatar-section">
                    <div class="avatar-preview ${version.avatar ? '' : 'avatar-upload-placeholder'}" onclick="triggerImageUpload('${character.id}', '${version.id}')" style="cursor: pointer; transition: all 0.2s ease;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                     ${version.avatar ? `<img src="${version.avatar}" alt="Avatar">` : `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 0.9em; text-align: center;"><div><div style="color: var(--text-muted); font-size: 3em; margin-bottom: 12px;">+</div>點擊上傳圖片</div></div>`}
                </div>
                    <input type="file" class="file-input" id="avatar-upload-${version.id}" accept="image/*" 
                           onchange="handleImageUpload('${character.id}', '${version.id}', this.files[0])">
                </div>
                
                <div class="basic-info-fields">
                    ${this.renderCharacterBasicFields(character, version)}
                </div>
            </div>
            ${this.renderCharacterMainFields(character, version)}
        `;
    }
    
   // 渲染角色基本資訊欄位
static renderCharacterBasicFields(character, version) {
    return `
        <!-- 第一行：創作者 + 角色版本 -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
            <div class="field-group" style="margin-bottom: 0;">
                <label class="field-label">
                    ${t('creator')}
                    <span class="field-stats" data-target="creator-${version.id}">0 ${t('chars')}</span>
                </label>
                <input type="text" class="field-input" id="creator-${version.id}" 
                       placeholder="${t('creatorPlaceholder')}"
                       oninput="updateField('character', '${character.id}', '${version.id}', 'creator', this.value); updateStats()" 
                       value="${version.creator || ''}">
            </div>

            <div class="field-group" style="margin-bottom: 0;">
                <label class="field-label">
                    ${t('charVersion')}
                    <span class="field-stats" data-target="charVersion-${version.id}">0 ${t('chars')}</span>
                </label>
                <input type="text" class="field-input" id="charVersion-${version.id}" 
                       placeholder="${t('versionPlaceholder')}"
                       oninput="updateField('character', '${character.id}', '${version.id}', 'charVersion', this.value); updateStats()" 
                       value="${version.charVersion || ''}">
            </div>
        </div>

        <!-- 第二行：創作者備註 -->
        <div class="field-group" style="margin-bottom: 20px;">
            <label class="field-label">
                ${t('creatorNotes')}
                <span class="field-stats" data-target="creatorNotes-${version.id}">0 ${t('chars')}</span>
                <button class="fullscreen-btn" onclick="openFullscreenEditor('creatorNotes-${version.id}', '${t('creatorNotes')}')" 
                        title="全螢幕編輯" style="margin-left: 8px;">⛶</button>
            </label>
            <textarea class="field-input" id="creatorNotes-${version.id}" 
                  placeholder="${t('notesPlaceholder')}"
                  style="min-height: 120px; resize: vertical;"
                  oninput="updateField('character', '${character.id}', '${version.id}', 'creatorNotes', this.value); updateStats()">${version.creatorNotes || ''}</textarea>
        </div>

        <!-- 第三行：嵌入標籤 -->
        <div class="field-group" style="margin-bottom: 0;">
            <label class="field-label">
                ${t('tags')}
                <span class="field-stats" data-target="tags-${version.id}">0 ${t('chars')}</span>
            </label>
            <input type="text" class="field-input" id="tags-${version.id}" 
                   placeholder="${t('tagsPlaceholder')}"
                   oninput="updateField('character', '${character.id}', '${version.id}', 'tags', this.value); updateStats()" 
                   value="${version.tags || ''}">
        </div>
    `;
}
    
// 渲染角色主要欄位
static renderCharacterMainFields(character, version) {
    const fields = [
        { id: 'description', label: t('description'), placeholder: t('descPlaceholder') },
        { id: 'personality', label: t('personality'), placeholder: t('personalityPlaceholder') },
        { id: 'scenario', label: t('scenario'), placeholder: t('scenarioPlaceholder') },
        { id: 'dialogue', label: t('dialogue'), placeholder: t('dialoguePlaceholder') },
        { id: 'firstMessage', label: t('firstMessage'), placeholder: t('firstMsgPlaceholder') }
    ];
    
    return fields.map(field => {
        const fieldId = field.id === 'description' ? 'desc' : field.id === 'firstMessage' ? 'firstmsg' : field.id;
        return `
            <div class="field-group">
                <label class="field-label">
                    ${field.label}
                    <span class="field-stats" data-target="${fieldId}-${version.id}">0 ${t('chars')} / 0 ${t('tokens')}</span>
                    <button class="fullscreen-btn" onclick="openFullscreenEditor('${fieldId}-${version.id}', '${field.label}')" 
                            title="全螢幕編輯">⛶</button>
                </label>
                <textarea class="field-input auto-resize" id="${fieldId}-${version.id}" 
          placeholder="${field.placeholder}"
          style="resize: vertical;"
          oninput="updateField('character', '${character.id}', '${version.id}', '${field.id}', this.value); updateStats(); autoResizeTextarea(this);">${version[field.id] || ''}</textarea>
            </div>
        `;
    }).join('');
}
    
    // 渲染自定義版本內容
    static renderCustomVersionContent(section, version) {
        return `
            <!-- 動態欄位區域 -->
            <div id="custom-fields-${version.id}">
                ${version.fields.map(field => this.renderCustomField(section.id, version.id, field)).join('')}
            </div>
            
            <!-- 新增欄位按鈕 -->
            <button class="btn btn-secondary" onclick="addCustomField('${section.id}', '${version.id}')" style="margin-top: 16px;">
                + ${t('addField')}
            </button>
        `;
    }

// 渲染自定義欄位
static renderCustomField(sectionId, versionId, field) {
    return `
        <div class="field-group" id="field-${field.id}">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="flex: 1;">
                    <input type="text" value="${field.name}" 
                           onchange="updateCustomFieldName('${sectionId}', '${versionId}', '${field.id}', this.value)"
                           placeholder="${t('fieldNamePlaceholder')}"
                           style="background: transparent; border: 1px solid transparent; padding: 4px 8px; border-radius: 4px; font-size: 0.9em; font-weight: 500;">
                    <span class="field-stats" data-target="custom-field-${field.id}" style="margin-left: 12px; font-size: 0.85em; color: var(--text-muted);">0 ${t('chars')} / 0 ${t('tokens')}</span>
                    <button class="fullscreen-btn" onclick="openFullscreenEditor('custom-field-${field.id}', '${field.name}')" 
                            title="全螢幕編輯" style="margin-left: 8px;">⛶</button>
                </div>
                <button class="btn btn-secondary btn-small" onclick="confirmRemoveCustomField('${sectionId}', '${versionId}', '${field.id}')" style="margin-left: 12px;">
                    ${t('deleteField')}
                </button>
            </div>
            <textarea class="field-input auto-resize" id="custom-field-${field.id}" 
          placeholder="${t('customFieldPlaceholder')}"
          style="resize: vertical;"
          oninput="updateCustomFieldContent('${sectionId}', '${versionId}', '${field.id}', this.value); updateStats(); autoResizeTextarea(this);">${field.content}</textarea>
        </div>
    `;
}
    
    // 渲染世界書版本內容
static renderWorldBookVersionContent(worldBook, version) {
    return `
        <!-- 條目列表 -->
        <div class="entries-container">
            ${version.entries.length > 0 ? `
                <!-- 條目標題標籤（只顯示一次） -->
${UIUtils.createTableHeader([
    { width: '24px', title: '' },
    { width: '36px', title: '' },
    { width: '1fr', title: t('entryTitleComment') },
    { width: '52px', title: t('triggerStrategy'), style: 'text-align: center;' },
    { width: '120px', title: t('insertPosition'), style: 'text-align: center;' },
    { width: '60px', title: t('insertOrder'), style: 'text-align: center;' },
    { width: '50px', title: t('insertDepth'), style: 'text-align: center;' },
    { width: '50px', title: t('triggerPercent'), style: 'text-align: center;' },
    { width: '76px', title: '' }
])}
            ` : ''}
            
            ${version.entries.map(entry => this.renderWorldBookEntry(worldBook.id, version.id, entry)).join('')}
            
            <!-- 新增條目按鈕 -->
            <button class="btn btn-secondary" onclick="addWorldBookEntry('${worldBook.id}', '${version.id}')" style="margin-top: 16px;">
                + ${t('addEntry')}
            </button>
        </div>
    `;
}


// 在 ContentRenderer 類別中添加輔助方法
static createFieldGroup(config) {
    const hasStats = config.showStats !== false;
    return `
        <div class="field-group" style="margin-bottom: ${config.marginBottom || '12px'};">
            <label class="field-label">
                ${config.label}
                ${hasStats ? `<span class="field-stats" data-target="${config.id}" style="margin-left: 12px; font-size: 0.85em; color: var(--text-muted);">0 ${t('chars')} / 0 ${t('tokens')}</span>` : ''}
            </label>
            ${config.type === 'textarea' ? 
                `<textarea class="field-input ${config.scrollable ? 'scrollable' : ''}" id="${config.id}" 
                          placeholder="${config.placeholder || ''}"
                          style="${config.style || 'min-height: 120px; resize: vertical;'}"
                          ${config.onChange ? `oninput="${config.onChange}"` : ''}>${config.value || ''}</textarea>` :
                `<input type="${config.type || 'text'}" class="field-input" id="${config.id}"
                       placeholder="${config.placeholder || ''}"
                       value="${config.value || ''}"
                       ${config.min !== undefined ? `min="${config.min}"` : ''}
                       ${config.max !== undefined ? `max="${config.max}"` : ''}
                       ${config.onChange ? `onchange="${config.onChange}"` : ''}>`
            }
        </div>
    `;
}

static createToggleGroup(toggles, columns = 3) {
    return `
        <div class="toggle-grid" style="grid-template-columns: repeat(auto-fit, minmax(${180/columns}px, 1fr));">
            ${toggles.map(toggle => `
                <label class="toggle-item">
                    <input type="checkbox" ${toggle.checked ? 'checked' : ''} 
                           ${toggle.onChange ? `onchange="${toggle.onChange}"` : ''}>
                    <span>${toggle.label}</span>
                </label>
            `).join('')}
        </div>
    `;
}

// 渲染世界書條目
static renderWorldBookEntry(worldBookId, versionId, entry) {
    // Determine status icon
    let statusIcon = '';
    if (entry.constant) {
        statusIcon = '🔵'; // Blue light: Constant mode
    } else if (entry.vectorized) {
        statusIcon = '🔗'; // Link: Vectorized mode
    } else {
        statusIcon = '🟢'; // Green light: Selective mode
    }

    return `
        <div class="entry-panel" data-entry-id="${entry.id}" style="border: 1px solid var(--border-color); border-radius: 8px; padding: 20px; margin-bottom: 16px; background: var(--header-bg);">
            <!-- Entry header -->
            <div class="entry-header" style="display: grid; grid-template-columns: 24px 36px 1fr 52px 120px 60px 50px 50px 76px; gap: 8px; margin-bottom: 12px; align-items: center;">
                <!-- Toggle button -->
                <button class="entry-toggle-btn" onclick="toggleEntryContent('${entry.id}')" 
                        style="background: none; border: none; cursor: pointer; font-size: 14px; color: var(--text-muted); padding: 4px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
                    <span class="arrow-icon arrow-down"></span>
                </button>
                
                <!-- Enable entry toggle -->
                <label style="display: flex; align-items: center; cursor: pointer; margin-right: 8px;">
                    <input type="checkbox" ${!entry.disable ? 'checked' : ''} 
                           onchange="toggleEntryEnabled('${worldBookId}', '${versionId}', '${entry.id}')"
                           style="width: 0; height: 0; opacity: 0; margin: 0;">
                    <div class="toggle-switch" style="width: 36px; height: 20px; background: ${!entry.disable ? 'var(--success-color)' : 'var(--border-color)'}; border-radius: 10px; position: relative; transition: all 0.2s ease;">
                        <div style="width: 16px; height: 16px; background: white; border-radius: 50%; position: absolute; top: 2px; left: ${!entry.disable ? '18px' : '2px'}; transition: all 0.2s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.2);"></div>
                    </div>
                </label>
                
                <!-- Comment -->
                <div class="field-group" style="margin-bottom: 0; flex: 1; margin-right: 8px;">
                    <input type="text" class="field-input compact-input" 
                           placeholder="${t('entryTitle')}"
                           value="${entry.comment || ''}"
                           style="font-weight: 500;"
                           onchange="updateWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}', 'comment', this.value)">
                </div>
                
                <!-- Trigger mode -->
                <div class="field-group" style="margin-bottom: 0; margin-right: 8px;">
                    <select class="field-input compact-input" style="width: 55px;" onchange="updateEntryModeFromSelect('${worldBookId}', '${versionId}', '${entry.id}', this.value)">
                        <option value="selective" ${entry.selective && !entry.constant && !entry.vectorized ? 'selected' : ''}>🟢</option>
                        <option value="constant" ${entry.constant ? 'selected' : ''}>🔵</option>
                        <option value="vectorized" ${entry.vectorized ? 'selected' : ''}>🔗</option>
                    </select>
                </div>
                
                <!-- Insertion position -->
                <div class="field-group" style="margin-bottom: 0; margin-right: 8px;">
                    <select class="field-input compact-input" style="width: 120px;" onchange="updateWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}', 'position', parseInt(this.value))">
                        <option value="0" ${entry.position === 0 ? 'selected' : ''}>${t('Before Char Defs')}</option>
                        <option value="1" ${entry.position === 1 ? 'selected' : ''}>${t('After Char Defs')}</option>
                        <option value="2" ${entry.position === 2 ? 'selected' : ''}>${t('Top of Author\'s Note')}</option>
                        <option value="3" ${entry.position === 3 ? 'selected' : ''}>${t('Bottom of Author\'s Note')}</option>
                        <option value="4" ${entry.position === 4 ? 'selected' : ''}>${t('@ Depth')}</option>
                    </select>
                </div>

                <!-- Order -->
                <div class="field-group" style="margin-bottom: 0; margin-right: 8px;">
                    <input type="number" class="field-input compact-input" value="${entry.order || 100}" min="0" max="999" style="width: 60px;"
                           onchange="updateWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}', 'order', parseInt(this.value))">
                </div>
                
                <!-- Depth -->
                <div class="field-group" style="margin-bottom: 0; margin-right: 8px;">
                    <input type="number" class="field-input compact-input" value="${entry.depth || 4}" min="0" max="10" style="width: 50px;"
                           onchange="updateWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}', 'depth', parseInt(this.value))">
                </div>
                
                <!-- Copy entry button -->
                <button class="btn btn-secondary btn-small" onclick="copyWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}')" 
                        style="padding: 6px 8px; margin-right: 4px;" title="${t('copyEntry')}">
                    📋
                </button>
                
                <!-- Delete entry button -->
                <button class="btn btn-secondary btn-small" onclick="confirmRemoveWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}')" 
                        style="padding: 6px 8px;" title="${t('deleteEntry')}">
                    🗑️
                </button>
            </div>

            <!-- Entry content area -->
            <div class="entry-content" id="entry-content-${entry.id}">
                <!-- Basic settings -->
                <div class="entry-section">
                    <!-- Keywords -->
                    <div class="field-group" style="margin-bottom: 8px;">
                        <label class="field-label" style="margin-bottom: 4px; font-size: 0.85em;">${t('primaryKeywords')}</label>
                        <input type="text" class="field-input compact-input" 
                               placeholder="${t('keywordsPlaceholder')}"
                               value="${entry.key.join(', ')}"
                               onchange="updateWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}', 'key', this.value)">
                    </div>

                    <!-- Secondary filters -->
                    <div class="field-group" style="margin-bottom: 8px;">
                        <label class="field-label" style="margin-bottom: 4px; font-size: 0.85em;">${t('secondaryFilters')}</label>
                        <input type="text" class="field-input compact-input" 
                               placeholder="${t('secondaryKeysPlaceholder')}"
                               value="${entry.keysecondary.join(', ')}"
                               onchange="updateWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}', 'keysecondary', this.value)">
                    </div>
                    
                    <!-- Content -->
                    <div class="field-group" style="margin-bottom: 8px;">
                        <label class="field-label" style="margin-bottom: 4px; font-size: 0.85em; display: flex; justify-content: space-between; align-items: center;">
                            <span>
                                ${t('entryContentLabel')}
                                <span class="field-stats" data-target="worldbook-content-${entry.id}" style="margin-left: 8px; font-size: 0.8em; color: var(--text-muted);">0 ${t('chars')} / 0 ${t('tokens')}</span>
                                <button class="fullscreen-btn" onclick="openFullscreenEditor('worldbook-content-${entry.id}', '${t('entryContent')}')" 
                                        title="${t('fullscreenEditor')}" style="margin-left: 6px;">⛶</button>
                            </span>
                            <span style="font-size: 0.8em; color: var(--text-muted);">(UID: ${entry.uid || 0})</span>
                        </label>
                        <textarea class="field-input scrollable" id="worldbook-content-${entry.id}" 
                              placeholder="${t('entryContentPlaceholder')}"
                              style="min-height: 80px; resize: vertical;"
                              oninput="updateWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}', 'content', this.value); updateStats();">${entry.content}</textarea>
                    </div>
                </div>

                <!-- Advanced settings -->
                <details style="margin-bottom: 0;">
                    <summary style="cursor: pointer; color: var(--text-color); font-weight: 500; margin-bottom: 8px; font-size: 0.9em;">${t('advancedSettings')}</summary>
                    <div style="padding: 8px 0; border-top: 1px solid var(--border-color);">
                        
                        <!-- Priority and probability -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                            <div class="field-group" style="margin-bottom: 0;">
                                <label class="field-label" style="margin-bottom: 4px; font-size: 0.85em;">${t('includeGroups')}</label>
                                <input type="text" class="field-input compact-input" value="${entry.group || ''}" 
                                       placeholder="${t('groupPlaceholder')}"
                                       onchange="updateWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}', 'group', this.value)">
                            </div>
                            <div class="field-group" style="margin-bottom: 0;">
                                <label class="field-label" style="margin-bottom: 4px; font-size: 0.8em;">${t('automationId')}</label>
                                <input type="text" class="field-input compact-input" value="${entry.automationId || ''}" 
                                       placeholder="${t('automationIdPlaceholder')}"
                                       onchange="updateWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}', 'automationId', this.value)">
                            </div>
                        </div>

                        <!-- Group settings -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-bottom: 12px;">
                            <label style="display: flex; align-items: center; cursor: pointer; font-size: 0.85em;">
                                <input type="checkbox" ${entry.groupOverride ? 'checked' : ''} 
                                       onchange="updateWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}', 'groupOverride', this.checked)">
                                <span style="margin-left: 6px;">${t('groupPriority')}</span>
                            </label>
                            <label style="display: flex; align-items: center; cursor: pointer; font-size: 0.85em;">
                                <input type="checkbox" ${entry.useProbability ? 'checked' : ''} 
                                       onchange="updateWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}', 'useProbability', this.checked)">
                                <span style="margin-left: 6px;">${t('enableProbability')}</span>
                            </label>
                            <label style="display: flex; align-items: center; cursor: pointer; font-size: 0.85em;">
                                <input type="checkbox" ${entry.caseSensitive ? 'checked' : ''} 
                                       onchange="updateWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}', 'caseSensitive', this.checked)">
                                <span style="margin-left: 6px;">${t('caseSensitive')}</span>
                            </label>
                            <label style="display: flex; align-items: center; cursor: pointer; font-size: 0.85em;">
                                <input type="checkbox" ${entry.matchWholeWords ? 'checked' : ''} 
                                       onchange="updateWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}', 'matchWholeWords', this.checked)">
                                <span style="margin-left: 6px;">${t('matchWholeWords')}</span>
                            </label>
                            <label style="display: flex; align-items: center; cursor: pointer; font-size: 0.85em;">
                                <input type="checkbox" ${entry.useGroupScoring ? 'checked' : ''} 
                                       onchange="updateWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}', 'useGroupScoring', this.checked)">
                                <span style="margin-left: 6px;">${t('useGroupScoring')}</span>
                            </label>
                        </div>

                        <!-- Recursion control area -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; align-items: end;">
                            <!-- Left: Recursion control options -->
                            <div>
                                <div style="font-size: 0.85em; font-weight: 500; color: var(--text-color); margin-bottom: 8px;">${t('recursionControl')}</div>
                                <div style="display: flex; flex-direction: column; gap: 6px;">
                                    <label style="display: flex; align-items: center; cursor: pointer; font-size: 0.85em;">
                                        <input type="checkbox" ${entry.excludeRecursion ? 'checked' : ''} 
                                               onchange="updateWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}', 'excludeRecursion', this.checked)">
                                        <span style="margin-left: 6px;">${t('noRecursion')}</span>
                                    </label>
                                    <label style="display: flex; align-items: center; cursor: pointer; font-size: 0.85em;">
                                        <input type="checkbox" ${entry.preventRecursion ? 'checked' : ''} 
                                               onchange="updateWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}', 'preventRecursion', this.checked)">
                                        <span style="margin-left: 6px;">${t('preventRecursion')}</span>
                                    </label>
                                    <label style="display: flex; align-items: center; cursor: pointer; font-size: 0.85em;">
                                        <input type="checkbox" ${entry.delayUntilRecursion ? 'checked' : ''} 
                                               onchange="updateWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}', 'delayUntilRecursion', this.checked)">
                                        <span style="margin-left: 6px;">${t('delayRecursion')}</span>
                                    </label>
                                </div>
                            </div>
                            
                            <!-- Right: Value settings -->
                            <div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr 60px; gap: 8px; margin-bottom: 8px;">
                                    <div class="field-group" style="margin-bottom: 0;">
                                        <label class="field-label" style="margin-bottom: 4px; font-size: 0.8em;">${t('stickyValue')}</label>
                                        <input type="number" class="field-input compact-input" value="${entry.sticky || 0}" 
                                               onchange="updateWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}', 'sticky', parseInt(this.value))">
                                    </div>
                                    <div class="field-group" style="margin-bottom: 0;">
                                        <label class="field-label" style="margin-bottom: 4px; font-size: 0.8em;">${t('cooldownValue')}</label>
                                        <input type="number" class="field-input compact-input" value="${entry.cooldown || 0}" 
                                               onchange="updateWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}', 'cooldown', parseInt(this.value))">
                                    </div>
                                    <div class="field-group" style="margin-bottom: 0;">
                                        <label class="field-label" style="margin-bottom: 4px; font-size: 0.8em;">${t('groupWeight')}</label>
                                        <input type="number" class="field-input compact-input" value="${entry.groupWeight || 100}" min="1" max="100"
                                               onchange="updateWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}', 'groupWeight', parseInt(this.value))">
                                    </div>
                                </div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr 60px; gap: 8px;">
                                    <div class="field-group" style="margin-bottom: 0;">
                                        <label class="field-label" style="margin-bottom: 4px; font-size: 0.8em;">${t('delayValue')}</label>
                                        <input type="number" class="field-input compact-input" value="${entry.delay || 0}" 
                                               onchange="updateWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}', 'delay', parseInt(this.value))">
                                    </div>
                                    <div class="field-group" style="margin-bottom: 0;">
                                        <label class="field-label" style="margin-bottom: 4px; font-size: 0.85em;">${t('scanDepth')}</label>
                                        <input type="number" class="field-input compact-input" value="${entry.scanDepth || ''}" 
                                               placeholder="null"
                                               onchange="updateWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}', 'scanDepth', this.value ? parseInt(this.value) : null)">
                                    </div>
                                    <div class="field-group" style="margin-bottom: 0;">
                                        <label class="field-label" style="margin-bottom: 4px; font-size: 0.8em;">${t('probabilityValue')}</label>
                                        <input type="number" class="field-input compact-input" value="${entry.probability || 100}" min="1" max="100"
                                               onchange="updateWorldBookEntry('${worldBookId}', '${versionId}', '${entry.id}', 'probability', parseInt(this.value))">
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </details>
            </div>
        </div>
    `;
}
    
    // 渲染匯出區域
    static renderExportSection(item) {
        const itemType = currentMode;
        
        switch (itemType) {
            case 'character':
                return `
                    <div class="export-section">
                        <h3>${t('exportCharacter') || '匯出角色卡'}</h3>
                        <div class="export-buttons">
                            <button class="btn btn-secondary" onclick="exportJSON('${item.id}')">${t('exportJSON')}</button>
                            <button class="btn btn-secondary" onclick="exportPNG('${item.id}')">${t('exportPNG')}</button>
                            <button class="btn btn-secondary" onclick="exportAllVersions('${item.id}')">${t('exportAll')}</button>
                        </div>
                    </div>
                `;
                
            case 'worldbook':
                return `
                    <div class="export-section">
                        <h3>${t('exportWorldBook')}</h3>
                        <div class="export-buttons">
                            <button class="btn btn-secondary" onclick="exportWorldBook('${item.id}')">${t('exportWorldBook')}</button>
                        </div>
                    </div>
                `;
                
            case 'custom':
                return `
                    <div class="export-section">
                        <h3>匯出自定義內容</h3>
                        <div class="export-buttons">
                            <button class="btn btn-secondary" onclick="exportCustomTXT('${item.id}')">${t('exportTXT')}</button>
                            <button class="btn btn-secondary" onclick="exportCustomMarkdown('${item.id}')">${t('exportMarkdown')}</button>
                        </div>
                    </div>
                `;
                
            default:
                return '';
        }
    }
    
    // 工具函數
    static getVersionsToShow(item) {
        const currentVersionId = ItemManager.getCurrentVersionId();
        
        return viewMode === 'compare' ? 
            item.versions.filter(v => compareVersions.includes(v.id)) : 
            item.versions.filter(v => v.id === currentVersionId);
    }
    
    static getItemTypeDisplay(itemType) {
        switch (itemType) {
            case 'character': return '角色';
            case 'worldbook': return '世界書';
            case 'custom': return '筆記';
            default: return '項目';
        }
    }
    
    static getCopyButtonText(itemType) {
        switch (itemType) {
            case 'character': return t('copyCharacter');
            case 'worldbook': return t('copyWorldBook');
            case 'custom': return t('copySection');
            default: return t('copy');
        }
    }
    
    static getDeleteButtonText(itemType) {
        switch (itemType) {
            case 'character': return t('deleteCharacter');
            case 'worldbook': return t('deleteWorldBook');
            case 'custom': return t('deleteSection');
            default: return t('delete');
        }
    }
    
    static getVersionStatsDisplay(version, itemType) {
        const stats = calculateVersionStats(version, itemType);
        return stats;
    }
    
    static renderEmptyState() {
        return `<div style="text-align: center; padding: 80px; color: var(--text-muted);">${t('selectCharacter') || '請選擇一個項目'}</div>`;
    }
    
    static renderHomePage(container) {
        renderHomePage(); // 使用現有的首頁渲染函數
    }

static createFieldGroup(config) {
    const hasStats = config.showStats !== false;
    return `
        <div class="field-group" style="margin-bottom: ${config.marginBottom || '12px'};">
            <label class="field-label">
                ${config.label}
                ${hasStats ? `<span class="field-stats" data-target="${config.id}" style="margin-left: 12px; font-size: 0.85em; color: var(--text-muted);">0 ${t('chars')} / 0 ${t('tokens')}</span>` : ''}
            </label>
            ${config.type === 'textarea' ? 
                `<textarea class="field-input ${config.scrollable ? 'scrollable' : ''}" id="${config.id}" 
                          placeholder="${config.placeholder || ''}"
                          style="${config.style || 'min-height: 120px; resize: vertical;'}"
                          ${config.onChange ? `oninput="${config.onChange}"` : ''}>${config.value || ''}</textarea>` :
                `<input type="${config.type || 'text'}" class="field-input" id="${config.id}"
                       placeholder="${config.placeholder || ''}"
                       value="${config.value || ''}"
                       ${config.min !== undefined ? `min="${config.min}"` : ''}
                       ${config.max !== undefined ? `max="${config.max}"` : ''}
                       ${config.onChange ? `onchange="${config.onChange}"` : ''}>`
            }
        </div>
    `;
}

static createToggleGroup(toggles, columns = 3) {
    return `
        <div class="toggle-grid" style="grid-template-columns: repeat(auto-fit, minmax(${180/columns}px, 1fr));">
            ${toggles.map(toggle => `
                <label class="toggle-item">
                    <input type="checkbox" ${toggle.checked ? 'checked' : ''} 
                           ${toggle.onChange ? `onchange="${toggle.onChange}"` : ''}>
                    <span>${toggle.label}</span>
                </label>
            `).join('')}
        </div>
    `;
}
}

        // 統一的名稱更新函數
function updateItemName(type, itemId, name) {
    const item = ItemManager.getItemsArray(type).find(i => i.id === itemId);
    if (item) {
        item.name = name;
        renderSidebar();
        markAsChanged();
    }
}

function updateVersionName(type, itemId, versionId, name) {
    const item = ItemManager.getItemsArray(type).find(i => i.id === itemId);
    if (item) {
        const version = item.versions.find(v => v.id === versionId);
        if (version) {
            version.name = name;
            renderSidebar();
            markAsChanged();
        }
    }
}


function toggleSection(sectionName) {
    const content = document.getElementById(`${sectionName}-content`);
    const icon = document.getElementById(`${sectionName}-icon`);
    const header = icon.closest('.sidebar-section-header');
    
    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        icon.innerHTML = '<span class="arrow-icon arrow-down"></span>';  // 改這裡
        header.classList.add('expanded');
    } else {
        content.classList.add('collapsed');
        icon.innerHTML = '<span class="arrow-icon arrow-right"></span>';  // 改這裡
        header.classList.remove('expanded');
    }
}

function autoResizeTextarea(textarea) {
    // 檢查是否為創作者備註欄位（固定高度，不自動調整）
    if (textarea.id.includes('creatorNotes-')) {
        return;
    }
    textarea.style.height = 'auto';
    const minHeight = 120;
    let newHeight = Math.max(minHeight, textarea.scrollHeight);
// 移除最大高度限制，允許無限制調整
textarea.style.height = newHeight + 'px';
textarea.style.overflowY = 'auto';  // 永遠顯示滾動條樣式
}

function initAutoResize() {
    // 為所有 textarea 添加自動調整功能
    const textareas = document.querySelectorAll('textarea.field-input');
    textareas.forEach(textarea => {
        // 添加 auto-resize class
        textarea.classList.add('auto-resize');
        
        // 初始調整大小
        autoResizeTextarea(textarea);
        
        // 監聽輸入事件
        textarea.addEventListener('input', function() {
            autoResizeTextarea(this);
        });
        
        // 監聽貼上事件
        textarea.addEventListener('paste', function() {
            // 稍微延遲以確保貼上的內容已經插入
            setTimeout(() => {
                autoResizeTextarea(this);
            }, 10);
        });
    });
}


function countTokens(text) {
    if (!text) return 0;
    
    // 確保編碼器已初始化
    const encoding = initTiktoken();
    
    if (encoding) {
        try {
            return encoding.encode(text).length;
        } catch (error) {
            console.warn('purejs-tiktoken 計算失敗:', error);
        }
    }
    
    // 降級到備用方法
    return countTokensBasic(text);
}

// 備份原來的函數（重命名）
function countTokensBasic(text) {
    // 您原來的 countTokens 函數內容
    if (!text) return 0;
    
    text = text.trim().replace(/\s+/g, ' ');
    let tokenCount = 0;
    let i = 0;
    
    while (i < text.length) {
        const char = text[i];
        
        if (/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(char)) {
            tokenCount += 1;
            i++;
        }
        else if (/[a-zA-Z]/.test(char)) {
            let wordStart = i;
            while (i < text.length && /[a-zA-Z]/.test(text[i])) {
                i++;
            }
            const word = text.slice(wordStart, i);
            
            if (word.length <= 3) {
                tokenCount += 1;
            } else if (word.length <= 6) {
                tokenCount += 1.5;
            } else if (word.length <= 10) {
                tokenCount += 2;
            } else {
                tokenCount += Math.ceil(word.length / 4);
            }
        }
        else if (/[0-9]/.test(char)) {
            let numStart = i;
            while (i < text.length && /[0-9.,]/.test(text[i])) {
                i++;
            }
            const num = text.slice(numStart, i);
            tokenCount += Math.ceil(num.replace(/[.,]/g, '').length / 3);
        }
        else if (/[^\s]/.test(char)) {
            if (i < text.length - 1) {
                const twoChar = text.slice(i, i + 2);
                if (['--', '...', '!!', '??', '::'].includes(twoChar)) {
                    tokenCount += 1;
                    i += 2;
                    continue;
                }
            }
            
            if (/[.!?,:;()[\]{}"'`~@#$%^&*+=<>|\\/-]/.test(char)) {
                tokenCount += 0.5;
            } else {
                tokenCount += 1;
            }
            i++;
        }
        else {
            i++;
        }
    }
    
    const specialTokens = text.match(/\{\{(user|char|random|pick|roll)\}\}/g);
    if (specialTokens) {
        tokenCount += specialTokens.length * 0.5;
    }
    
    return Math.ceil(tokenCount);
}

        function changeTheme(themeName) {
            // 移除主題切換功能，只保留自訂顏色
        }

        // 統一的模態框管理器
class ModalManager {
    static create(config) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        
        const content = `
            <div class="modal-content" style="max-width: ${config.maxWidth || '520px'};">
                <div class="modal-header">
                    <h3 class="modal-title">${config.title}</h3>
                    <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
                </div>
                ${config.content}
                ${config.footer ? `<div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">${config.footer}</div>` : ''}
            </div>
        `;
        
        modal.innerHTML = content;
        document.body.appendChild(modal);
        
        // 點擊外部關閉
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
        return modal;
    }

    // 創建清空資料確認模態框
    static clearDataConfirm() {
        const content = `
            <div style="margin-bottom: 24px;">
                <h4 style="color: var(--text-color); margin-bottom: 16px;">${t('clearDataTitle')}</h4>
                <p style="color: var(--text-muted); font-size: 0.9em; line-height: 1.6; white-space: pre-line; margin-bottom: 20px;">
                    ${t('clearDataMessage')}
                </p>
                
                <div style="background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 6px; padding: 16px; margin-bottom: 20px;">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                        <span style="font-size: 1.5em;">💾</span>
                        <div>
                            <div style="font-weight: 600; color: var(--text-color);">建議先備份資料</div>
                            <div style="font-size: 0.85em; color: var(--text-muted);">點擊下方按鈕匯出完整備份</div>
                        </div>
                    </div>
                    <button class="btn btn-primary" onclick="DataManager.exportAllFromModal()">
                        ${t('exportBeforeClear')}
                    </button>
                </div>
            </div>
        `;

        const footer = `
            <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">
                ${t('cancelClear')}
            </button>
            <button class="btn btn-danger" onclick="DataManager.confirmClearAll()" style="background: var(--danger-color); border-color: var(--danger-color);">
                ${t('confirmClearData')}
            </button>
        `;

        return this.create({
            title: `<span style="color: var(--danger-color);">${t('clearDataWarning')}</span>`,
            content: content,
            footer: footer,
            maxWidth: '500px'
        });
    }
    
    static confirm(config) {
        return new Promise((resolve) => {
            const modal = this.create({
                title: config.title,
                content: `<p style="margin-bottom: 20px; color: var(--text-muted); line-height: 1.6;">${config.message}</p>`,
                footer: `
                    <button class="btn btn-secondary" onclick="this.closest('.modal').remove(); window.modalResolve(false);">${config.cancelText || t('cancel')}</button>
                    <button class="btn ${config.dangerMode ? 'btn-danger' : 'btn-primary'}" onclick="this.closest('.modal').remove(); window.modalResolve(true);">${config.confirmText || t('apply')}</button>
                `,
                maxWidth: config.maxWidth || '400px'
            });
            
            window.modalResolve = resolve;
        });
    }

    // 創建匯出格式選擇模態框
    static exportFormatSelector(config) {
        const { characterName, versionCount, onFormatSelect } = config;
        
        const content = `
            <p style="margin-bottom: 20px; color: var(--text-muted); font-size: 0.9em;">
                ${t('exportAllDesc', characterName, versionCount)}
            </p>
            
            <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
                <div class="format-option" data-format="json" style="cursor: pointer;">
    <div onclick="ExportFormatManager.selectFormat('json')" style="display: flex; align-items: center; gap: 12px; padding: 16px; background: var(--secondary-color); border: 2px solid var(--border-color); border-radius: 8px; cursor: pointer; transition: all 0.2s ease;">
                        <input type="radio" name="export-format" value="json" style="margin: 0;">
                        <div>
                            <strong>${t('jsonFormat')}</strong>
                            <div style="font-size: 0.85em; color: var(--text-muted); margin-top: 4px;">
                                ${t('jsonDesc')}
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="format-option" data-format="png" style="cursor: pointer;">
    <div onclick="ExportFormatManager.selectFormat('png')" style="display: flex; align-items: center; gap: 12px; padding: 16px; background: var(--secondary-color); border: 2px solid var(--border-color); border-radius: 8px; cursor: pointer; transition: all 0.2s ease;">
                        <input type="radio" name="export-format" value="png" style="margin: 0;">
                        <div>
                            <strong>${t('pngFormat')}</strong>
                            <div style="font-size: 0.85em; color: var(--text-muted); margin-top: 4px;">
                                ${t('pngDesc')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const footer = `
            <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">${t('cancel')}</button>
            <button class="btn btn-primary" onclick="ExportFormatManager.startBatch()" id="start-export" disabled>${t('startExport')}</button>
        `;

        const modal = this.create({
            title: t('exportAllTitle'),
            content: content,
            footer: footer,
            maxWidth: '500px'
        });

        // 儲存回調函數到全域變數（供 ExportManager 使用）
        window.currentExportCallback = onFormatSelect;
        
        return modal;
    }

    // 創建自定義內容模態框
    static custom(config) {
        return this.create({
            title: config.title,
            content: config.content,
            footer: config.footer,
            maxWidth: config.maxWidth || '520px',
            className: config.className || ''
        });
    }
    
    // 創建顏色選擇器模態框
    static colorPicker(currentColors = {}) {
        const colorInputs = [
            { id: 'primary-color', label: t('primaryColor'), value: currentColors.primary || getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() },
            { id: 'secondary-color', label: t('secondaryColor'), value: currentColors.secondary || getComputedStyle(document.documentElement).getPropertyValue('--secondary-color').trim() },
            { id: 'accent-color', label: t('accentColor'), value: currentColors.accent || getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() },
            { id: 'bg-color', label: t('bgColor'), value: currentColors.bg || getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim() },
            { id: 'surface-color', label: t('surfaceColor'), value: currentColors.surface || getComputedStyle(document.documentElement).getPropertyValue('--surface-color').trim() },
            { id: 'text-color', label: t('textColor'), value: currentColors.textColor || getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() },
            { id: 'text-muted', label: t('textMutedColor'), value: currentColors.textMuted || getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() },
            { id: 'border-color', label: t('borderColor'), value: currentColors.borderColor || getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() },
            { id: 'header-bg', label: t('headerBgColor'), value: currentColors.headerBg || getComputedStyle(document.documentElement).getPropertyValue('--header-bg').trim() },
            { id: 'sidebar-bg', label: t('sidebarBgColor'), value: currentColors.sidebarBg || getComputedStyle(document.documentElement).getPropertyValue('--sidebar-bg').trim() },
            { id: 'main-content-bg', label: t('mainContentBgColor'), value: currentColors.mainContentBg || getComputedStyle(document.documentElement).getPropertyValue('--main-content-bg').trim() },
            { id: 'content-bg', label: t('contentBgColor'), value: currentColors.contentBg || getComputedStyle(document.documentElement).getPropertyValue('--content-bg').trim() }
        ];

        const colorInputsHTML = colorInputs.map(input => `
            <div class="color-input-group">
                <label>${input.label}</label>
                <input type="color" class="color-input" id="${input.id}" value="${input.value}">
            </div>
        `).join('');

        const content = `
            ${colorInputsHTML}
            
            <div class="color-preview">
                <div class="color-preview-item" id="preview-primary">${currentLang === 'zh' ? '主要' : 'Primary'}</div>
                <div class="color-preview-item" id="preview-secondary">${currentLang === 'zh' ? '次要' : 'Secondary'}</div>
                <div class="color-preview-item" id="preview-accent">${currentLang === 'zh' ? '強調' : 'Accent'}</div>
                <div class="color-preview-item" id="preview-surface" style="color: var(--text-color);">${currentLang === 'zh' ? '介面' : 'Surface'}</div>
                <div class="color-preview-item" id="preview-text" style="background: var(--surface-color); color: white; border: 1px solid var(--border-color);">${currentLang === 'zh' ? '文字' : 'Text'}</div>
                <div class="color-preview-item" id="preview-text-muted" style="background: var(--surface-color); color: white; border: 1px solid var(--border-color);">${currentLang === 'zh' ? '次文字' : 'Muted'}</div>
            </div>

            <input type="file" id="importColorFileModal" accept=".json" style="display: none;" onchange="handleColorImportFromModal(event)">
        `;

        const footer = `
            <div style="display: flex; gap: 12px; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="btn btn-secondary" onclick="ColorManager.applyDefaults()">${t('restoreDefault')}</button>
                    <button class="btn btn-secondary" onclick="ColorManager.applyEyeCare()">${t('eyeCareMode')}</button>
                    <button class="btn btn-secondary" onclick="ColorManager.export()">${t('exportColorTheme')}</button>
                    <button class="btn btn-secondary" onclick="ColorManager.import()">${t('importColorTheme')}</button>
                </div>
                <div style="display: flex; gap: 12px;">
                    <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">${t('cancel')}</button>
                    <button class="btn btn-primary" onclick="ColorManager.apply()">${t('apply')}</button>
                </div>
            </div>
        `;

        return this.create({
            title: t('customTheme'),
            content: content,
            footer: footer,
            maxWidth: '600px'
        });
    }
}

        // ===== 顏色管理器 =====
class ColorManager {
    // 應用自定義顏色
    static apply() {
        const colors = this.getCurrentColors();
        this.applyColorsToCSS(colors);
        this.saveColors(colors);
        this.closeModal();
    }
    
    // 獲取當前選擇的顏色
    static getCurrentColors() {
        return {
            primary: document.getElementById('primary-color').value,
            secondary: document.getElementById('secondary-color').value,
            accent: document.getElementById('accent-color').value,
            bg: document.getElementById('bg-color').value,
            surface: document.getElementById('surface-color').value,
            textColor: document.getElementById('text-color').value,
            textMuted: document.getElementById('text-muted').value,
            borderColor: document.getElementById('border-color').value,
            headerBg: document.getElementById('header-bg').value,
            sidebarBg: document.getElementById('sidebar-bg').value,
            mainContentBg: document.getElementById('main-content-bg').value,
            contentBg: document.getElementById('content-bg').value
        };
    }
    
    // 應用顏色到CSS
    static applyColorsToCSS(colors) {
        const root = document.documentElement;
        Object.entries(colors).forEach(([key, value]) => {
            const cssVar = this.getCSSVarName(key);
            root.style.setProperty(cssVar, value);
        });
    }
    
    // 獲取CSS變數名稱
    static getCSSVarName(key) {
        const mapping = {
            textColor: '--text-color',
            textMuted: '--text-muted',
            borderColor: '--border-color',
            headerBg: '--header-bg',
            sidebarBg: '--sidebar-bg',
            mainContentBg: '--main-content-bg',
            contentBg: '--content-bg'
        };
        return mapping[key] || `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}-color`;
    }
    
    // 儲存顏色設定
    static saveColors(colors) {
        localStorage.setItem('characterCreatorCustomColors', JSON.stringify(colors));
    }
    
    // 應用預設顏色
    static applyDefaults() {
        const defaults = {
            primary: '#4E5E79',
            secondary: '#fafafa',
            accent: '#8b7355',
            bg: '#f3f6f7',
            surface: '#ffffff',
            textColor: '#2d3748',
            textMuted: '#718096',
            borderColor: '#e2e8f0',
            headerBg: '#f1f5f9',
            sidebarBg: '#f8fafc',
            mainContentBg: '#fafbfc',
            contentBg: '#ffffff'
        };
        
        this.updateInputs(defaults);
        this.applyColorsToCSS(defaults);
        localStorage.removeItem('characterCreatorCustomColors');
        this.closeModal();
    }
    
    // 應用護眼模式
    static applyEyeCare() {
        const eyeCareColors = {
            primary: '#404040',
            secondary: '#6e6e6e',
            accent: '#4b768b',
            bg: '#7d7d7d',
            surface: '#2a2a2a',
            textColor: '#e0e0e0',
            textMuted: '#aaaaaa',
            borderColor: '#525252',
            headerBg: '#000000',
            sidebarBg: '#1f1f1f',
            mainContentBg: '#1a1a1a',
            contentBg: '#292929'
        };
        
        this.updateInputs(eyeCareColors);
        this.applyColorsToCSS(eyeCareColors);
        this.saveColors(eyeCareColors);
        this.closeModal();
    }
    
    // 更新輸入框值
    static updateInputs(colors) {
        Object.entries(colors).forEach(([key, value]) => {
            const input = document.getElementById(this.getInputId(key));
            if (input) input.value = value;
        });
    }
    
    // 獲取輸入框ID
    static getInputId(key) {
        const mapping = {
            textColor: 'text-color',
            textMuted: 'text-muted',
            borderColor: 'border-color',
            headerBg: 'header-bg',
            sidebarBg: 'sidebar-bg',
            mainContentBg: 'main-content-bg',
            contentBg: 'content-bg'
        };
        return mapping[key] || `${key.replace(/([A-Z])/g, '-$1').toLowerCase()}-color`;
    }
    
    // 匯出顏色主題
    static export() {
        const colors = this.getCurrentColors();
        const colorTheme = {
            name: prompt('請輸入配色主題名稱：') || '自訂配色',
            colors: colors,
            exportDate: new Date().toISOString(),
            version: '1.0.0'
        };

        const blob = new Blob([JSON.stringify(colorTheme, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${colorTheme.name}_配色主題.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    // 匯入顏色主題
    static import() {
        document.getElementById('importColorFileModal').click();
    }
    
    // 關閉模態框
    static closeModal() {
        const modal = document.querySelector('.modal');
        if (modal) modal.remove();
    }
}

       function showColorPicker() {
    const modal = ModalManager.colorPicker();
    
    // 初始化顏色預覽更新功能
    const colorInputs = modal.querySelectorAll('input[type="color"]');
    
    function updatePreview() {
        const primaryInput = document.getElementById('primary-color');
        const secondaryInput = document.getElementById('secondary-color');
        const accentInput = document.getElementById('accent-color');
        const surfaceInput = document.getElementById('surface-color');
        const textInput = document.getElementById('text-color');
        const textMutedInput = document.getElementById('text-muted');
        
        if (primaryInput) document.getElementById('preview-primary').style.backgroundColor = primaryInput.value;
        if (secondaryInput) document.getElementById('preview-secondary').style.backgroundColor = secondaryInput.value;
        if (accentInput) document.getElementById('preview-accent').style.backgroundColor = accentInput.value;
        if (surfaceInput) document.getElementById('preview-surface').style.backgroundColor = surfaceInput.value;
        if (textInput) document.getElementById('preview-text').style.color = textInput.value;
        if (textMutedInput) document.getElementById('preview-text-muted').style.color = textMutedInput.value;
    }
    
    // 為所有顏色輸入添加預覽更新事件
    colorInputs.forEach(input => {
        input.addEventListener('input', updatePreview);
    });
    
    // 初始化預覽
    updatePreview();

}

        // ===== 資料管理器 =====
class DataManager {
    // 從模態框匯出所有資料
    static exportAllFromModal() {
        exportAllData();
        // 匯出後給用戶反饋
        setTimeout(() => {
            const modal = document.querySelector('.modal');
            if (modal) {
                const message = modal.querySelector('.modal-content > div:nth-child(2)');
                if (message) {
                    message.innerHTML = `
                        <div style="text-align: center; padding: 20px;">
                            <div style="color: var(--success-color); font-weight: 600; margin-bottom: 8px;">備份匯出完成</div>
                            <div style="color: var(--text-muted); font-size: 0.9em;">現在可以安全地清空資料了</div>
                        </div>
                    `;
                }
            }
        }, 1000);
    }

    // 確認清空所有資料
    static async confirmClearAll() {
        try {
            // 清空所有陣列
            characters = [];
            customSections = [];
            worldBooks = [];
            
            // 重置當前狀態
            currentCharacterId = null;
            currentVersionId = null;
            currentCustomSectionId = null;
            currentCustomVersionId = null;
            currentWorldBookId = null;
            currentWorldBookVersionId = null;
            currentMode = 'character';
            viewMode = 'single';
            compareVersions = [];
            isHomePage = true;
            hasUnsavedChanges = false;
            
            // 清空 IndexedDB
            if (characterDB.db) {
                const transaction = characterDB.db.transaction(['characters', 'customSections', 'worldBooks'], 'readwrite');
                await Promise.all([
                    characterDB.clearStore(transaction.objectStore('characters')),
                    characterDB.clearStore(transaction.objectStore('customSections')),
                    characterDB.clearStore(transaction.objectStore('worldBooks'))
                ]);
            }
            
            // 清空 localStorage
            localStorage.removeItem('characterCreatorData');
            localStorage.removeItem('characterCreatorCustomData');
            localStorage.removeItem('characterCreatorWorldBooks');
            localStorage.removeItem('characterCreatorCustomColors');
            
            // 重置 CSS 變數為預設值
            ColorManager.applyDefaults();
            
            // 關閉對話框
            const modal = document.querySelector('.modal');
            if (modal) {
                modal.remove();
            }
            
            // 重新渲染界面
            renderAll();
            
            // 顯示成功通知
            this.showClearSuccessNotification();
            
        } catch (error) {
            console.error('清空資料失敗：', error);
            alert('清空資料時發生錯誤，請重新整理頁面後再試');
        }
    }

    // 顯示清空成功通知
    static showClearSuccessNotification() {
        NotificationManager.show({
            content: `
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 1.2em;">🗑️</span>
                    <div>
                        <div>${t('dataCleared')}</div>
                        <div style="font-size: 0.8em; opacity: 0.9; margin-top: 4px;">頁面已重置為初始狀態</div>
                    </div>
                </div>
            `,
            type: 'success',
            duration: 4000
        });
    }
}
        // ===== 匯出格式管理器 =====
class ExportFormatManager {
    static selectedFormat = null;
    
    // 選擇匯出格式
    static selectFormat(format) {
        this.selectedFormat = format;
    
        // 更新選中狀態
document.querySelectorAll('.format-option').forEach(option => {
    const container = option.querySelector('div[onclick]'); // 找到有 onclick 的 div
            const radio = option.querySelector('input[type="radio"]');
            
            if (option.dataset.format === format) {
                container.style.borderColor = 'var(--primary-color)';
                container.style.backgroundColor = 'var(--secondary-color)';
                radio.checked = true;
            } else {
                container.style.borderColor = 'var(--border-color)';
                container.style.backgroundColor = 'transparent';
                radio.checked = false;
            }
        });
        
        // 啟用開始匯出按鈕
const startButton = document.getElementById('start-export');
if (startButton) {
    startButton.disabled = false;
    startButton.classList.remove('btn-secondary');
    startButton.classList.add('btn-primary');
}
    }
    
    // 開始批次匯出
static startBatch() {

    if (!this.selectedFormat) {
        alert('請先選擇匯出格式');
        return;
    }
    
    if (!window.currentExportCallback) {
        alert('匯出回調函數未設置');
        return;
    }
    
    // 關閉模態框
    const modal = document.querySelector('.modal');
    if (modal) {
        modal.remove();
    }
    
    // 執行匯出
    try {
        window.currentExportCallback(this.selectedFormat);
    } catch (error) {
        console.error('匯出執行失敗:', error);
        alert('匯出失敗: ' + error.message);
    }
    
    // 清理
    this.selectedFormat = null;
    window.currentExportCallback = null;
}
}


   // 全螢幕文字編輯器管理器
class FullscreenEditor {
    static currentEditor = null;
    
    static open(textareaId, title = '編輯文字') {
        const originalTextarea = document.getElementById(textareaId);
        if (!originalTextarea) return;
        
        // 如果已經有編輯器開啟，先關閉
        if (this.currentEditor) {
            this.close();
        }
        
        // 創建全螢幕編輯器
        const overlay = document.createElement('div');
        overlay.className = 'fullscreen-editor-overlay';
        
        // 創建容器結構
        const container = document.createElement('div');
        container.className = 'fullscreen-editor-container';
        
       // 創建標題欄
const header = document.createElement('div');
header.className = 'fullscreen-editor-header';
header.innerHTML = `
    <h3 class="fullscreen-editor-title">${title}</h3>
    <div class="fullscreen-editor-stats" id="fullscreen-stats">
        0 字 / 0 tokens
    </div>
`;
        
        // 創建內容區
        const content = document.createElement('div');
        content.className = 'fullscreen-editor-content';
        
        // 創建文字框
        const textarea = document.createElement('textarea');
        textarea.className = 'fullscreen-editor-textarea';
        textarea.id = 'fullscreen-textarea';
        textarea.placeholder = originalTextarea.placeholder;
        textarea.value = originalTextarea.value;
        
        content.appendChild(textarea);
        
       // 創建底部欄
const footer = document.createElement('div');
footer.className = 'fullscreen-editor-footer';
footer.innerHTML = `
    <button class="btn btn-secondary" onclick="FullscreenEditor.close()" style="padding: 6px 16px; font-size: 0.85em; min-height: auto;">關閉</button>
`;
        
        // 組裝編輯器
        container.appendChild(header);
        container.appendChild(content);
        container.appendChild(footer);
        overlay.appendChild(container);
        
        document.body.appendChild(overlay);
        this.currentEditor = {
            overlay: overlay,
            originalTextarea: originalTextarea,
            fullscreenTextarea: textarea
        };
        
        // 聚焦到文字框
        setTimeout(() => {
            this.currentEditor.fullscreenTextarea.focus();
            // 將游標移到文字末尾
            const textLength = this.currentEditor.fullscreenTextarea.value.length;
            this.currentEditor.fullscreenTextarea.setSelectionRange(textLength, textLength);
        }, 100);
        
        // 添加事件監聽器
        this.setupEventListeners();
        
        // 初始統計更新
        this.updateStats();
        
        // 點擊背景關閉
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.close();
            }
        });
        
        // ESC鍵關閉，Ctrl+S 全域儲存
        document.addEventListener('keydown', this.handleKeydown);
    }
    
    static setupEventListeners() {
        if (!this.currentEditor) return;
        
        const textarea = this.currentEditor.fullscreenTextarea;
        
        // 即時同步內容到原始文字框
        textarea.addEventListener('input', () => {
            // 同步內容
            this.syncToOriginal();
            // 更新統計
            this.updateStats();
        });
    }
    
    static syncToOriginal() {
        if (!this.currentEditor) return;
        
        const newValue = this.currentEditor.fullscreenTextarea.value;
        const originalTextarea = this.currentEditor.originalTextarea;
        
        // 更新原始文字框的值
        originalTextarea.value = newValue;
        
        // 觸發原始文字框的 input 事件來更新統計和儲存狀態
        const inputEvent = new Event('input', { bubbles: true });
        originalTextarea.dispatchEvent(inputEvent);
        
        // 如果原始文字框有 oninput 屬性，也要執行
        if (originalTextarea.oninput) {
            originalTextarea.oninput.call(originalTextarea);
        }
        
        // 自動調整原始文字框高度
        autoResizeTextarea(originalTextarea);
    }
    
    static updateStats() {
        if (!this.currentEditor) return;
        
        const textarea = this.currentEditor.fullscreenTextarea;
        const statsElement = document.getElementById('fullscreen-stats');
        
        if (textarea && statsElement) {
            const text = textarea.value;
            const chars = text.length;
            const tokens = countTokens(text);
            statsElement.textContent = `${chars} 字 / ${tokens} tokens`;
        }
    }
    
    static close() {
        if (!this.currentEditor) return;
        
        // 最後一次同步（確保內容同步）
        this.syncToOriginal();
        
        // 移除鍵盤事件監聽器
        document.removeEventListener('keydown', this.handleKeydown);
        
        // 移除編輯器
        this.currentEditor.overlay.remove();
        this.currentEditor = null;
    }
    
    static handleKeydown = (e) => {
        if (e.key === 'Escape') {
            FullscreenEditor.close();
        } else if (e.ctrlKey && e.key === 's') {
            // Ctrl+S 觸發全域儲存
            e.preventDefault();
            
            // 先同步內容
            if (FullscreenEditor.currentEditor) {
                FullscreenEditor.syncToOriginal();
            }
            
            // 呼叫全域儲存函數
            saveData();
            showSaveNotification();
        }
    }
}

// ===== 統一的匯入管理器 =====
class ImportManager {
    // 統一的檔案類型檢測
    static detectFileType(file) {
        if (file.type === 'application/json' || file.name.endsWith('.json')) {
            return 'json';
        } else if (file.type === 'image/png' || file.name.endsWith('.png')) {
            return 'png';
        }
        return null;
    }
    
    // 統一的檔案讀取
    static readFile(file, type) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = function(e) {
                resolve(e.target.result);
            };
            
            reader.onerror = function() {
                reject(new Error('檔案讀取失敗'));
            };
            
            if (type === 'json') {
                reader.readAsText(file);
            } else if (type === 'png') {
                reader.readAsArrayBuffer(file);
            }
        });
    }
    
    // 統一的錯誤處理和通知
    static showError(message) {
        alert(message);
    }
    
    static showSuccess(message) {
        alert(message);
    }
    
    // 統一的匯入流程控制
    static async handleImport(file, targetType) {
        const fileType = this.detectFileType(file);
        
        if (!fileType) {
            this.showError('請選擇JSON或PNG格式的檔案');
            return false;
        }
        
        try {
            if (targetType === 'character') {
                return await this.handleCharacterImport(file, fileType);
            } else if (targetType === 'worldbook') {
                return await this.handleWorldBookImport(file, fileType);
            } else if (targetType === 'all') {
                return await this.handleAllDataImport(file, fileType);
            }
        } catch (error) {
            this.showError('匯入失敗：' + error.message);
            return false;
        }
    }

    // 角色匯入處理
    static async handleCharacterImport(file, fileType) {
        try {
            let data;
            
            if (fileType === 'json') {
                const textContent = await this.readFile(file, 'json');
                data = JSON.parse(textContent);
            } else if (fileType === 'png') {
                const arrayBuffer = await this.readFile(file, 'png');
                const charaData = extractCharaFromPNG(new Uint8Array(arrayBuffer));
                
                if (!charaData) {
                    this.showError('PNG檔案中未找到角色資料，請確認這是有效的角色卡PNG檔案');
                    return false;
                }
                
                const jsonString = atob(charaData);
                data = JSON.parse(decodeURIComponent(escape(jsonString)));
                
                // 為PNG檔案添加頭像
                const imageBlob = new Blob([arrayBuffer], { type: 'image/png' });
                data.avatar = await this.blobToBase64(imageBlob);
            }
            
            // 呼叫現有的角色匯入邏輯
            importCharacterFromData(data);
            return true;
            
        } catch (error) {
            throw new Error('角色檔案解析失敗：' + error.message);
        }
    }
    
    // 世界書匯入處理
    static async handleWorldBookImport(file, fileType) {
        if (fileType !== 'json') {
            this.showError('世界書只支援JSON格式');
            return false;
        }
        
        try {
            const textContent = await this.readFile(file, 'json');
            const data = JSON.parse(textContent);
            
            // 檢查是否為 SillyTavern 世界書格式
            if (data.entries && typeof data.entries === 'object') {
                importSillyTavernWorldBook(data, file.name);
                return true;
            } else {
                this.showError('檔案格式不正確，請選擇有效的世界書檔案');
                return false;
            }
            
        } catch (error) {
            throw new Error('世界書檔案解析失敗：' + error.message);
        }
    }
    
    // 完整資料匯入處理
    static async handleAllDataImport(file, fileType) {
        if (fileType !== 'json') {
            this.showError('完整備份只支援JSON格式');
            return false;
        }
        
        try {
            const textContent = await this.readFile(file, 'json');
            const data = JSON.parse(textContent);
            
            if (data.characters && Array.isArray(data.characters)) {
                const totalItems = data.characters.length + (data.customSections ? data.customSections.length : 0) + (data.worldBooks ? data.worldBooks.length : 0);
                
                let confirmMessage = `確定要匯入 ${data.characters.length} 個角色`;
                if (data.customSections) confirmMessage += `、${data.customSections.length} 個筆記`;
                if (data.worldBooks) confirmMessage += `、${data.worldBooks.length} 個世界書`;
                confirmMessage += '嗎？這將覆蓋現有的所有資料！';
                
                const confirmImport = confirm(confirmMessage);
                
                if (confirmImport) {
                    characters = data.characters;
                    customSections = data.customSections || [];
                    worldBooks = data.worldBooks || [];
                    
                    // 重置狀態
                    currentCharacterId = characters[0]?.id || null;
                    currentVersionId = characters[0]?.versions[0]?.id || null;
                    currentCustomSectionId = customSections[0]?.id || null;
                    currentCustomVersionId = customSections[0]?.versions[0]?.id || null;
                    currentWorldBookId = worldBooks[0]?.id || null;
                    currentWorldBookVersionId = worldBooks[0]?.versions[0]?.id || null;
                    currentMode = 'character';
                    compareVersions = [];
                    
                    renderAll();
                    saveData();
                    this.showSuccess('資料匯入成功！');
                    return true;
                }
                return false;
            } else {
                this.showError('檔案格式不正確，請選擇有效的備份檔案');
                return false;
            }
            
        } catch (error) {
            throw new Error('備份檔案解析失敗：' + error.message);
        }
    }
    
    // 工具函數：Blob轉Base64
    static blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
}

// 開啟全螢幕編輯器的便利函數
function openFullscreenEditor(textareaId, title) {
    FullscreenEditor.open(textareaId, title);
}

     function applyCustomColors() {
    ColorManager.apply();
}


        function adjustBrightness(hex, factor) {
    // 移除 # 符號
    hex = hex.replace('#', '');
    
    // 轉換為 RGB
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // 調整亮度
    const newR = Math.max(0, Math.min(255, Math.round(r + (255 - r) * factor)));
    const newG = Math.max(0, Math.min(255, Math.round(g + (255 - g) * factor)));
    const newB = Math.max(0, Math.min(255, Math.round(b + (255 - b) * factor)));
    
    // 轉回 hex
    const toHex = (n) => n.toString(16).padStart(2, '0');
    return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

    //Ctrl+S 快捷鍵儲存功能
//添加鍵盤事件監聽器
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // 檢查是否按下 Ctrl+S (Windows/Linux) 或 Cmd+S (Mac)
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault(); // 防止瀏覽器預設的儲存行為
            
            // 直接觸發和頂部儲存按鈕相同的功能
            saveData();
            showSaveNotification();
        }
    });
}

        function applyDefaultColors() {
    ColorManager.applyDefaults();
}

function applyEyeCareColors() {
    ColorManager.applyEyeCare();
}

function exportColorThemeFromModal() {
    ColorManager.export();
}

function importColorThemeFromModal() {
    document.getElementById('importColorFileModal').click();
}

function handleColorImportFromModal(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const themeData = JSON.parse(e.target.result);
            
            if (themeData.colors) {
                const confirmImport = confirm(`確定要匯入配色主題「${themeData.name || '未命名'}」嗎？`);
                
                if (confirmImport) {
                    // 更新對話框中的顏色選擇器
const colors = themeData.colors;
if (colors.primary) document.getElementById('primary-color').value = colors.primary;
if (colors.secondary) document.getElementById('secondary-color').value = colors.secondary;
if (colors.accent) document.getElementById('accent-color').value = colors.accent;
if (colors.bg) document.getElementById('bg-color').value = colors.bg;
if (colors.surface) document.getElementById('surface-color').value = colors.surface;
if (colors.textColor) document.getElementById('text-color').value = colors.textColor;
if (colors.textMuted) document.getElementById('text-muted').value = colors.textMuted;
if (colors.borderColor) document.getElementById('border-color').value = colors.borderColor;
if (colors.headerBg) document.getElementById('header-bg').value = colors.headerBg;
if (colors.sidebarBg) document.getElementById('sidebar-bg').value = colors.sidebarBg;
if (colors.mainContentBg) document.getElementById('main-content-bg').value = colors.mainContentBg;
if (colors.contentBg) document.getElementById('content-bg').value = colors.contentBg;
                
                    
                    alert(`配色主題「${themeData.name || '未命名'}」匯入成功！請點擊「套用」來應用設定。`);
                }
            } else {
                alert('檔案格式不正確，請選擇有效的配色主題檔案');
            }
        } catch (error) {
            alert('檔案讀取失敗：' + error.message);
        }
    };
    reader.readAsText(file);
    
    event.target.value = '';
}

function applyImportedColors(colors) {
    const root = document.documentElement;
    
    if (colors.primary) root.style.setProperty('--primary-color', colors.primary);
    if (colors.secondary) root.style.setProperty('--secondary-color', colors.secondary);
    if (colors.accent) root.style.setProperty('--accent-color', colors.accent);
    if (colors.bg) root.style.setProperty('--bg-color', colors.bg);
    if (colors.surface) root.style.setProperty('--surface-color', colors.surface);
    if (colors.textColor) root.style.setProperty('--text-color', colors.textColor);
    if (colors.textMuted) root.style.setProperty('--text-muted', colors.textMuted);
    if (colors.borderColor) root.style.setProperty('--border-color', colors.borderColor);
    if (colors.headerBg) root.style.setProperty('--header-bg', colors.headerBg);
    if (colors.sidebarBg) root.style.setProperty('--sidebar-bg', colors.sidebarBg);
    if (colors.mainContentBg) root.style.setProperty('--main-content-bg', colors.mainContentBg);
    if (colors.contentBg) root.style.setProperty('--content-bg', colors.contentBg);
    
    // 儲存匯入的配色
    localStorage.setItem('characterCreatorCustomColors', JSON.stringify(colors));
}

        
        // 統一的通知管理器
class NotificationManager {
    static show(config) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${config.type === 'success' ? 'var(--success-color)' : 
                        config.type === 'warning' ? 'var(--warning-color)' :
                        config.type === 'error' ? 'var(--danger-color)' : 'var(--primary-color)'};
            color: white;
            padding: ${config.large ? '16px 24px' : '12px 20px'};
            border-radius: ${config.large ? '8px' : '6px'};
            font-size: 0.9em;
            font-weight: 500;
            z-index: 9999;
            box-shadow: var(--shadow-medium);
            transform: translateX(100%);
            transition: transform 0.3s ease;
            max-width: ${config.maxWidth || '300px'};
        `;
        
        notification.innerHTML = config.content;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 10);
        
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, config.duration || 2000);
        
        return notification;
    }
    
    static success(message, duration = 2000) {
        return this.show({
            content: `✓ ${message}`,
            type: 'success',
            duration
        });
    }
    
    static warning(message, duration = 4000) {
        return this.show({
            content: `⚠️ ${message}`,
            type: 'warning',
            duration
        });
    }
    
    static error(message, duration = 4000) {
        return this.show({
            content: `❌ ${message}`,
            type: 'error',
            duration
        });
    }
}

        function showSaveNotification() {
    NotificationManager.success(t('saved'));
}


// 統一的滾動條管理器
class ScrollbarManager {
    // 應用滾動條樣式到指定元素
    static applyTo(element, type = 'custom') {
        if (!element) return;
        
        // 移除現有的滾動條類別
        element.classList.remove('custom-scrollbar', 'hidden-scrollbar', 'thin-scrollbar', 'main-scrollbar');
        
        // 添加新的滾動條類別
        switch (type) {
            case 'hidden':
                element.classList.add('hidden-scrollbar');
                break;
            case 'thin':
                element.classList.add('thin-scrollbar');
                break;
            case 'main':
                element.classList.add('main-scrollbar');
                break;
            case 'custom':
            default:
                element.classList.add('custom-scrollbar');
                break;
        }
    }
    
    // 批量應用滾動條樣式
    static applyToAll(selector, type = 'custom') {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => this.applyTo(element, type));
    }
    
    // 初始化所有滾動條
    static initializeAll() {
        // 側邊欄使用隱藏滾動條
        this.applyTo(document.getElementById('sidebar'), 'hidden');
        
        // 主要內容區使用主要滾動條
        this.applyTo(document.getElementById('contentArea'), 'main');
        
        // 所有文字輸入框使用細滾動條
        this.applyToAll('textarea.field-input', 'thin');
        
        // 可滾動區域使用自定義滾動條
        this.applyToAll('.scrollable', 'custom');
    }
    
    // 更新滾動條顏色（當主題改變時）
    static updateColors(colors) {
        const root = document.documentElement;
        if (colors.scrollbarThumb) {
            root.style.setProperty('--scrollbar-thumb-color', colors.scrollbarThumb);
        }
        if (colors.scrollbarThumbHover) {
            root.style.setProperty('--scrollbar-thumb-hover-color', colors.scrollbarThumbHover);
        }
    }
}

async function showStorageInfo() {
    const estimate = await characterDB.getStorageEstimate();
    if (estimate) {
        const usagePercent = Math.round((estimate.used / estimate.total) * 100);
        console.log(`📊 儲存空間: ${estimate.used}MB / ${estimate.total}MB (${usagePercent}%) | 可用: ${estimate.available}MB`);
        
        // 如果使用超過 80%，顯示警告
        if (usagePercent > 80) {
            showStorageWarning(estimate.used * 1024); // 轉換為 KB
        }
    }
}

function showStorageWarning(sizeKB) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--warning-color);
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        font-size: 0.9em;
        z-index: 9999;
        box-shadow: var(--shadow-large);
        max-width: 300px;
    `;
    notification.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 8px;">⚠️ 儲存空間警告</div>
        <div style="font-size: 0.85em;">
            目前使用 ${Math.round(sizeKB/1024)}MB，接近瀏覽器限制。<br>
            建議定期匯出備份資料。
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 8000);
}

// 添加儲存狀態顯示（可選）
function addStorageIndicator() {
    const sidebarFooter = document.querySelector('.sidebar-footer');
    if (sidebarFooter && !document.getElementById('storage-indicator')) {
        const indicator = document.createElement('div');
        indicator.id = 'storage-indicator';
        indicator.style.cssText = `
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 0.75em;
            color: var(--text-muted);
            padding: 0 px 0;
            border-bottom: 0px solid var(--border-color);
            margin-bottom: 8px;
        `;
        indicator.innerHTML = '💾 <span id="storage-text">載入中...</span>';
        
        // 插入到 sidebar-footer-text 之前
        const footerText = sidebarFooter.querySelector('.sidebar-footer-text');
        if (footerText) {
            sidebarFooter.insertBefore(indicator, footerText);
        } else {
            sidebarFooter.appendChild(indicator);
        }
        
        updateStorageIndicator();
    }
}

async function updateStorageIndicator() {
    const indicator = document.getElementById('storage-text');
    if (!indicator) return;
    
    const estimate = await characterDB.getStorageEstimate();
    if (estimate) {
        const usagePercent = Math.round((estimate.used / estimate.total) * 100);
        indicator.textContent = `${estimate.used}MB (${usagePercent}%)`;
        
        const container = indicator.parentElement;
        if (usagePercent > 80) {
            container.style.color = 'var(--warning-color)';
        } else {
            container.style.color = 'var(--text-muted)';
        }
    } else {
        indicator.textContent = 'localStorage';
    }
}

// 變更追蹤函數：
function markAsChanged() {
    hasUnsavedChanges = true;
    updateSaveButtonStates();
}

function markAsSaved() {
    hasUnsavedChanges = false;
    lastSavedData = JSON.stringify(characters);
    updateSaveButtonStates();
}

function updateSaveButtonStates() {
    setTimeout(() => {
        const saveButtons = document.querySelectorAll('button[onclick*="saveData()"]');
        saveButtons.forEach(btn => {
            if (hasUnsavedChanges) {
                btn.classList.add('btn-warning');
                btn.classList.remove('btn-secondary');
                // 更新按鈕文字顯示有未儲存變更
                btn.innerHTML = t('unsavedChanges');
            } else {
                btn.classList.remove('btn-warning');
                btn.classList.add('btn-secondary');
                // 恢復正常文字
                btn.innerHTML = t('save');
            }
        });
    }, 50);
}


        function exportAllData() {
    const exportData = {
        characters: characters,
        customSections: customSections, // 新增
        exportDate: new Date().toISOString(),
        version: '1.0.0'
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chronicler_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

        function importAllData() {
            document.getElementById('importAllFile').click();
        }

       function handleImportAll(event) {
    const file = event.target.files[0];
    if (!file) return;

    ImportManager.handleImport(file, 'all');
    event.target.value = ''; // 清空input值
}


        async function loadData() {
    try {
        // 初始化 IndexedDB
        const dbInitialized = await characterDB.init();
        
        if (dbInitialized) {
            // 檢查是否需要遷移 localStorage 資料
            const isMigrated = await characterDB.checkMigrationStatus();
            if (!isMigrated) {
                await characterDB.migrateFromLocalStorage();
            }

            // 從 IndexedDB 載入資料
            characters = await characterDB.loadCharacters();
            customSections = await characterDB.loadCustomSections();
            worldBooks = await characterDB.loadWorldBooks();
            
            console.log('✅ 使用 IndexedDB 載入資料');
        } else {
            // 降級到 localStorage
            const saved = localStorage.getItem('characterCreatorData');
            if (saved) {
                characters = JSON.parse(saved);
            }

            const savedCustom = localStorage.getItem('characterCreatorCustomData');
            if (savedCustom) {
                customSections = JSON.parse(savedCustom);
            }

            const savedWorldBooks = localStorage.getItem('characterCreatorWorldBooks');
            if (savedWorldBooks) {
                worldBooks = JSON.parse(savedWorldBooks);
            }
            
            console.log('⚠️ 使用 localStorage 載入資料');
        }

        // 設定初始狀態 - 保持首頁狀態，不自動選擇任何項目
        isHomePage = true;
        currentCharacterId = null;
        currentVersionId = null;
        currentCustomSectionId = null;
        currentCustomVersionId = null;
        currentWorldBookId = null;
        currentWorldBookVersionId = null;
        
        markAsSaved();
        // 遷移舊資料的時間戳
        TimestampManager.migrateOldData();
        
        // 顯示儲存空間資訊
        showStorageInfo();
        
    } catch (error) {
        console.error('載入資料失敗：', error);
        // 確保有基本資料結構
        characters = characters || [];
        customSections = customSections || [];
        worldBooks = worldBooks || [];
    }
}

function selectSidebarItem(type, id, subId = null) {
    isHomePage = false; // 離開首頁狀態
    // 清理之前的狀態
    viewMode = 'single';
    compareVersions = [];
    
    switchToItem(type, id);
    
    // 如果指定了子版本ID，則選擇該版本
    if (subId) {
        switch (type) {
            case 'character':
                currentVersionId = subId;
                break;
            case 'custom':
                currentCustomVersionId = subId;
                break;
            case 'worldbook':
                currentWorldBookVersionId = subId;
                break;
        }
    }
    
    renderAll();
}


function switchToCharacterMode() {
    currentMode = 'character';
    viewMode = 'single';
    compareVersions = [];
    renderAll();
}

function switchToCustomMode() {
    currentMode = 'custom';
    viewMode = 'single';
    compareVersions = [];
    renderAll();
}

   function toggleCompareMode() {
    if (viewMode === 'single') {
        let currentItem, versionsArray;
        
        if (currentMode === 'character') {
            currentItem = characters.find(c => c.id === currentCharacterId);
            versionsArray = currentItem?.versions || [];
        } else if (currentMode === 'worldbook') {
            currentItem = worldBooks.find(wb => wb.id === currentWorldBookId);
            versionsArray = currentItem?.versions || [];
        } else if (currentMode === 'custom') {
            currentItem = customSections.find(s => s.id === currentCustomSectionId);
            versionsArray = currentItem?.versions || [];
        }
        
        if (currentItem && versionsArray.length > 1) {
            // 使用統一的版本選擇器
            compareVersions = [];
            VersionSelector.create({
                title: t('selectVersionsToCompare') || '選擇要對比的版本',
                description: t('selectTwoVersions') || '選擇2個版本進行對比',
                versions: versionsArray,
                maxSelections: 2,
                onConfirm: (selectedVersions) => {
                    compareVersions = selectedVersions;
                    viewMode = 'compare';
                    renderAll();
                }
            });
        } else {
            alert(t('needTwoVersions'));
        }
    } else {
        viewMode = 'single';
        compareVersions = [];
        renderAll();
    }
}

// 當直接設置viewMode時，也要更新頂部控制欄
function setViewMode(mode) {
    viewMode = mode;
    
    // 立即更新頂部控制欄樣式
    const headerBar = document.querySelector('.character-header-bar');
    if (headerBar) {
        headerBar.classList.remove('single-mode', 'compare-mode');
        headerBar.classList.add(mode === 'compare' ? 'compare-mode' : 'single-mode');
    }
    
    renderAll();
}

        async function saveData() {
    try {
        // 使用 IndexedDB 儲存
        const results = await Promise.all([
            characterDB.saveCharacters(characters),
            characterDB.saveCustomSections(customSections),
            characterDB.saveWorldBooks(worldBooks)
        ]);

        const allSaved = results.every(result => result === true);
        
        if (allSaved) {
            markAsSaved();
            console.log('✅ 資料已儲存到 IndexedDB');
            showSaveNotification();
        } else {
            console.warn('⚠️ 部分資料儲存失敗，已降級到 localStorage');
            markAsSaved(); 
            showSaveNotification();
        }
        
        // 更新儲存空間資訊
        showStorageInfo();
        
    } catch (error) {
        console.error('儲存資料失敗：', error);
        
        // 完全降級到舊方案
        try {
            localStorage.setItem('characterCreatorData', JSON.stringify(characters));
            localStorage.setItem('characterCreatorCustomData', JSON.stringify(customSections));
            localStorage.setItem('characterCreatorWorldBooks', JSON.stringify(worldBooks));
            markAsSaved();
            showSaveNotification();
            console.log('🔄 已降級使用 localStorage 儲存');
        } catch (fallbackError) {
            console.error('連 localStorage 都儲存失敗:', fallbackError);
            if (fallbackError.name === 'QuotaExceededError') {
                showStorageExceededDialog();
            } else {
                alert('儲存失敗，請檢查瀏覽器存儲空間');
            }
        }
    }
}

      
async function saveDataWithNotification() {
    await saveData();
    showSaveNotification();
}

       function showVersionSelector() {
    let currentItem, versionsArray;
    
    if (currentMode === 'character') {
        currentItem = characters.find(c => c.id === currentCharacterId);
        versionsArray = currentItem?.versions || [];
    } else if (currentMode === 'worldbook') {
        currentItem = worldBooks.find(wb => wb.id === currentWorldBookId);
        versionsArray = currentItem?.versions || [];
    } else if (currentMode === 'custom') {
        currentItem = customSections.find(s => s.id === currentCustomSectionId);
        versionsArray = currentItem?.versions || [];
    }
    
    if (!currentItem) return;

    // 重要：每次打開對話框都強制清空之前的選擇
    compareVersions = [];

    VersionSelector.create({
        title: t('selectVersionsToCompare') || '選擇要對比的版本',
        description: t('selectTwoVersions') || '選擇2個版本進行對比',
        versions: versionsArray,
        maxSelections: 2,
        onConfirm: (selectedVersions) => {
            compareVersions = selectedVersions;
            viewMode = 'compare';
            renderAll();
        }
    });
}


        // 統一的字段更新函數
function updateField(itemType, itemId, versionId, field, value) {
    let item, version;
    
    switch (itemType) {
        case 'character':
            item = characters.find(c => c.id === itemId);
            if (item) {
                version = item.versions.find(v => v.id === versionId);
                if (version) {
    version[field] = value;
    
    // 更新時間戳
    TimestampManager.updateVersionTimestamp(itemType, itemId, versionId);
    
    updateStats();
    markAsChanged();
    
    // 更新統計和時間戳顯示
        setTimeout(() => {
        StatsManager.updateVersionStatsWithTimestamp(itemType, itemId, versionId);
    }, 10);
}
            }
            break;
        case 'custom':
            item = customSections.find(s => s.id === itemId);
            if (item) {
                version = item.versions.find(v => v.id === versionId);
                if (version) {
    version[field] = value;
    
    // 更新時間戳
    TimestampManager.updateVersionTimestamp(itemType, itemId, versionId);
    
    updateStats();
    markAsChanged();
    
    // 更新統計和時間戳顯示
        setTimeout(() => {
        StatsManager.updateVersionStatsWithTimestamp(itemType, itemId, versionId);
    }, 10);
}
            }
            break;
        case 'worldbook':
            item = worldBooks.find(wb => wb.id === itemId);
            if (item) {
                version = item.versions.find(v => v.id === versionId);
                if (version) {
                    if (field === 'key' || field === 'keysecondary') {
                        version[field] = value.split(',').map(k => k.trim()).filter(k => k);
                    } else {
                        version[field] = value;
                    }
                    // 更新時間戳
                    TimestampManager.updateVersionTimestamp(itemType, itemId, versionId);
                    updateStats();
                    markAsChanged();
                        setTimeout(() => {
        StatsManager.updateVersionStatsWithTimestamp(itemType, itemId, versionId);
    }, 10);
                }
            }
            break;
        default:
            return;
    }
}

// 保持向後兼容的包裝函數
function updateCharacterField(characterId, versionId, field, value) {
    updateField('character', characterId, versionId, field, value);
}


function updateCharacterName(characterId, name) {
    updateItemName('character', characterId, name);
}

        function handleImageUpload(characterId, versionId, file) {
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            updateField('character', characterId, versionId, 'avatar', e.target.result);
            renderContent();
        };
        reader.readAsDataURL(file);
    }
}

function addCustomSection() {
    return ItemCRUD.add('custom');
}


function updateStats() {
    // 使用新的統計管理器更新所有統計
    StatsManager.updateStatsElements();
    StatsManager.updateVersionStats();
    StatsManager.updateSidebarStats();
}
        

        function renderSidebar() {
    const container = document.getElementById('sidebarContent');
    container.innerHTML = renderItemList('character', characters, currentCharacterId, currentVersionId);
    
    // 渲染自定義區塊列表
    const customContainer = document.getElementById('customSectionContent');
    if (customContainer) {
        customContainer.innerHTML = renderItemList('custom', customSections, currentCustomSectionId, currentCustomVersionId);
    }
    
    // 渲染世界書列表
    const worldBookContainer = document.getElementById('worldBookContent');
    if (worldBookContainer) {
        worldBookContainer.innerHTML = renderItemList('worldbook', worldBooks, currentWorldBookId, currentWorldBookVersionId);
    }
    
    // 更新翻譯文字
    updateSidebarTranslations();
    
    // 展開當前選中項目的版本列表
    expandCurrentItemVersions();
}

// 統一的項目列表渲染
function renderItemList(type, items, currentItemId, currentVersionId) {
    return items.map(item => renderSidebarItem(item, type, currentItemId, currentVersionId)).join('');
}

// 統一的側邊欄項目渲染
function renderSidebarItem(item, type, currentItemId, currentVersionId) {
    const isItemActive = (item.id === currentItemId && currentMode === type);
    
    return `
        <div class="character-item">
            <div class="character-header ${isItemActive ? 'active' : ''}" 
                 onclick="toggleItemVersions('${type}', '${item.id}')">
                <span class="expand-icon"><span class="arrow-icon arrow-right"></span></span>
                <div class="character-info">
                    <span>${item.name}</span>
                    <span style="font-size: 0.8em; opacity: 0.7;">${item.versions.length}</span>
                </div>
            </div>
            <div class="version-list" id="${type}-versions-${item.id}">
                ${item.versions.map(version => renderSidebarVersion(item, version, type, currentVersionId)).join('')}
            </div>
        </div>
    `;
}

// 統一的版本項目渲染
function renderSidebarVersion(item, version, type, currentVersionId) {
    // 檢查是否為當前項目類型
    const isCurrentMode = (currentMode === type);
    
    // 根據檢視模式決定版本是否為活動狀態
    let isVersionActive = false;
    if (isCurrentMode) {
        if (viewMode === 'compare') {
            // 對比模式：檢查版本是否在對比列表中
            isVersionActive = compareVersions.includes(version.id);
        } else {
            // 單一檢視模式：檢查是否為當前版本
            isVersionActive = (version.id === currentVersionId);
        }
    }
    
    const stats = StatsManager.calculateVersionStats(version, type);
    
    return `
        <div class="version-item ${isVersionActive ? 'active' : ''}" 
             onclick="selectSidebarItem('${type}', '${item.id}', '${version.id}')">
            <div style="display: flex; flex-direction: column; width: 100%; gap: 2px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    ${VersionUtils.getVersionIcon(version, type)}
                    <span style="font-weight: 500; flex: 1; text-align: left;">
                        ${version.name}
                    </span>
                </div>
                <div style="text-align: right; font-size: 0.7em; font-style: italic; color: var(--text-muted); opacity: 0.8; padding-right: 2px;">
                    ${stats.formatted}
                </div>
            </div>
        </div>
    `;
}

// 計算版本統計信息
function calculateVersionStats(version, type) {
    const stats = StatsManager.calculateVersionStats(version, type);
    return stats.formatted;
}

// 更新側邊欄翻譯文字
function updateSidebarTranslations() {
    // 更新側邊欄文字
    const characterTitle = document.querySelector('.sidebar-section-title');
    if (characterTitle) characterTitle.textContent = t('characterList');
    
    const addButtons = document.querySelectorAll('.sidebar-add-btn');
    if (addButtons[0]) addButtons[0].textContent = t('addCharacter');
    if (addButtons[1]) addButtons[1].textContent = t('importCharacter');
    
    const worldBookTitle = document.querySelectorAll('.sidebar-section-title')[1];
    if (worldBookTitle) {
        worldBookTitle.textContent = t('worldBook');
    }

    // 更新世界書按鈕文字
    const worldBookButtons = document.querySelectorAll('#worldbook-content .sidebar-add-btn');
    if (worldBookButtons[0]) worldBookButtons[0].textContent = t('addWorldBook');
    if (worldBookButtons[1]) worldBookButtons[1].textContent = t('importWorldBook');

    // 更新自定義欄位標題
    const customFieldTitle = document.querySelectorAll('.sidebar-section-title')[2];
    if (customFieldTitle) {
        customFieldTitle.textContent = t('customFields');
    }
    const addCustomBtn = document.querySelector('button[onclick="addCustomSection()"]');
    if (addCustomBtn) {
        addCustomBtn.textContent = t('addCustomField');
    }
}


// 展開當前選中項目的版本列表
function expandCurrentItemVersions() {
    // 如果是首頁狀態，不執行任何展開邏輯
    if (isHomePage) return;
    
    const expansions = [
        { mode: 'character', id: currentCharacterId, sectionId: 'characters' },
        { mode: 'custom', id: currentCustomSectionId, sectionId: 'custom' },
        { mode: 'worldbook', id: currentWorldBookId, sectionId: 'worldbook' }
    ];
    
    expansions.forEach(({ mode, id, sectionId }) => {
        if (currentMode === mode && id) {
            // 展開對應的側邊欄區塊
            const sectionContent = document.getElementById(`${sectionId}-content`);
            const sectionIcon = document.getElementById(`${sectionId}-icon`);
            if (sectionContent && sectionIcon) {
                sectionContent.classList.remove('collapsed');
                sectionIcon.innerHTML = '<span class="arrow-icon arrow-down"></span>';

                     // 新增：為展開的區塊標題添加 expanded class
    const sectionHeader = sectionIcon.closest('.sidebar-section-header');
    if (sectionHeader) {
        sectionHeader.classList.add('expanded');
    }

            }
            
            // 展開對應項目的版本列表
            const versionsList = document.getElementById(`${mode}-versions-${id}`);
            if (versionsList) {
                versionsList.classList.add('expanded');
                // 同時更新該項目的三角圖示
                const itemIcon = document.querySelector(`[onclick="toggleItemVersions('${mode}', '${id}')"] .expand-icon`);
                if (itemIcon) {
                    itemIcon.innerHTML = '<span class="arrow-icon arrow-down"></span>';
                }
            }
        } else {
            // 收合其他模式的區塊
            const sectionContent = document.getElementById(`${sectionId}-content`);
            const sectionIcon = document.getElementById(`${sectionId}-icon`);
            if (sectionContent && sectionIcon && currentMode !== mode) {
                sectionContent.classList.add('collapsed');
                sectionIcon.innerHTML = '<span class="arrow-icon arrow-right"></span>';

               
            }
        }
    });
}

       

// 渲染首頁
function renderHomePage() {
    const container = document.getElementById('contentArea');
    container.innerHTML = `
        <div style="padding: 0px;">
            
            <!-- 角色卡區塊 -->
            <div style="padding: 32px; background: transparent; border-radius: 12px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 60px;">
                    ${characters.map((character, index) => {
                        const firstVersion = character.versions[0];
                        return `
                            <div class="home-card" onclick="selectCharacterFromHome('${character.id}')" 
                                 style="cursor: pointer; aspect-ratio: 2 / 3; width: 180px; transition: all 0.2s ease;">
                                <!-- 角色圖片 -->
                                <div style="flex: 1 1 auto; width: 100%; height: 280px; aspect-ratio: 2 / 3; border-radius: 5px; overflow: hidden; background: transparent; border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: center; margin-bottom: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);">
                                    ${firstVersion.avatar ? 
                                        `<img src="${firstVersion.avatar}" style="width: 100%; height: 100%; object-fit: cover;" alt="${character.name}">` :
                                        ``
                                    }
                                </div>
                                <!-- 角色名稱 -->
                                <div style="text-align: center; padding: 0 8px;">
                                    <span style="font-size: 1em; color: var(--text-color); font-weight: 500; line-height: 1.3; display: block;">
                                        ${character.name}
                                    </span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                    
                    <!-- 創建新角色卡片 -->
                    <div class="home-card" onclick="addCharacterFromHome()" 
                         style="cursor: pointer; width: 180px; transition: all 0.2s ease;">
                        <div style="width: 100%; height: 280px; border: 2px dashed var(--border-color); border-radius: 12px; background: transparent; display: flex; flex-direction: column; align-items: center; justify-content: center; margin-bottom: 12px;">
                            <div style="color: var(--text-muted); font-size: 3em; margin-bottom: 12px;">+</div>
                            <span style="font-size: 0.9em; color: var(--text-muted); font-weight: 500; text-align: center;">
                                ${currentLang === 'zh' ? '創建角色' : 'Create Character'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    `;
    
    // 添加 hover 效果給角色卡片
    setTimeout(() => {
        document.querySelectorAll('.home-card').forEach(card => {
            card.addEventListener('mouseenter', function() {
                this.style.transform = 'translateY(-4px)';
                this.style.filter = 'brightness(1.02)';
            });
            card.addEventListener('mouseleave', function() {
                this.style.transform = 'translateY(0)';
                this.style.filter = 'brightness(1)';
            });
        });
    }, 100);
}

// 新函數：返回首頁
function goToHomePage() {
    isHomePage = true;
    viewMode = 'single';
    compareVersions = [];
    
    // 收合所有側邊欄區塊
    collapseAllSidebarSections();
    
    renderAll();
}

// 新增函數：收合所有側邊欄區塊
function collapseAllSidebarSections() {
    const sections = ['characters', 'worldbook', 'custom'];
    
    sections.forEach(sectionId => {
        // 收合主要區塊
        const sectionContent = document.getElementById(`${sectionId}-content`);
        const sectionIcon = document.getElementById(`${sectionId}-icon`);
        
        if (sectionContent && sectionIcon) {
            sectionContent.classList.add('collapsed');
            sectionIcon.innerHTML = '<span class="arrow-icon arrow-right"></span>';
            
        }
        
        // 收合所有項目的版本列表
        const itemsArray = DataOperations.getItems(sectionId === 'characters' ? 'character' : sectionId === 'worldbook' ? 'worldbook' : 'custom');
        itemsArray.forEach(item => {
            const versionsList = document.getElementById(`${sectionId === 'characters' ? 'character' : sectionId === 'worldbook' ? 'worldbook' : 'custom'}-versions-${item.id}`);
            if (versionsList) {
                versionsList.classList.remove('expanded');
            }
            
            // 收合項目的展開圖示
            const itemIcon = document.querySelector(`[onclick="toggleItemVersions('${sectionId === 'characters' ? 'character' : sectionId === 'worldbook' ? 'worldbook' : 'custom'}', '${item.id}')"] .expand-icon`);
            if (itemIcon) {
                itemIcon.innerHTML = '<span class="arrow-icon arrow-right"></span>';
            }
        });
    });
}

// 從首頁選擇角色
function selectCharacterFromHome(characterId) {
    isHomePage = false;
    currentMode = 'character';
    currentCharacterId = characterId;
    const character = characters.find(c => c.id === characterId);
    if (character) {
        currentVersionId = character.versions[0].id;
    }
    viewMode = 'single';
    compareVersions = [];
    renderAll();
    
    // 確保角色列表區塊展開
    setTimeout(() => {
        const charactersContent = document.getElementById('characters-content');
        const charactersIcon = document.getElementById('characters-icon');
        if (charactersContent && charactersIcon) {
            charactersContent.classList.remove('collapsed');
            charactersIcon.innerHTML = '<span class="arrow-icon arrow-down"></span>';
        }
    }, 50);
}


// 從首頁創建角色
function addCharacterFromHome() {
    isHomePage = false;
    ItemCRUD.add('character');
}


// 新函數：開始創作
function startCreating() {
    isHomePage = false;
    
    // 如果沒有角色，創建一個角色
    if (characters.length === 0) {
    ItemCRUD.add('character');
} else {
        // 有角色的話就切換到第一個角色
        currentMode = 'character';
        currentCharacterId = characters[0].id;
        currentVersionId = characters[0].versions[0].id;
    }
    
    viewMode = 'single';
    compareVersions = [];
    renderAll();
}

        function renderContent() {
    ContentRenderer.renderMainContent();
}


function confirmRemoveCustomField(sectionId, versionId, fieldId) {
    const section = customSections.find(s => s.id === sectionId);
    if (section) {
        const version = section.versions.find(v => v.id === versionId);
        if (version) {
            const field = version.fields.find(f => f.id === fieldId);
            if (field) {
                const confirmDelete = confirm(t('deleteFieldConfirm', field.name));
                
                if (confirmDelete) {
                    removeCustomField(sectionId, versionId, fieldId);
                }
            }
        }
    }
}

function updateCustomSectionName(sectionId, name) {
    updateItemName('custom', sectionId, name);
}

function updateCustomVersionName(sectionId, versionId, name) {
    updateVersionName('custom', sectionId, versionId, name);
}

function addCustomVersion(sectionId) {
    return VersionCRUD.add('custom', sectionId);
}

function copyCustomVersion(sectionId, versionId) {
    return VersionCRUD.copy('custom', sectionId, versionId);
}

function copyCustomSection(sectionId) {
    return ItemCRUD.copy('custom', sectionId);
}

function addCustomField(sectionId, versionId) {
    const section = customSections.find(s => s.id === sectionId);
    if (section) {
        const version = section.versions.find(v => v.id === versionId);
        if (version) {
            const newField = {
                id: generateId(),
                name: `Field ${version.fields.length + 1}`,
                content: ''
            };
            version.fields.push(newField);
            renderCustomContent();
            markAsChanged();
        }
    }
}

function updateCustomFieldName(sectionId, versionId, fieldId, name) {
    const section = customSections.find(s => s.id === sectionId);
    if (section) {
        const version = section.versions.find(v => v.id === versionId);
        if (version) {
            const field = version.fields.find(f => f.id === fieldId);
            if (field) {
                field.name = name;
                markAsChanged();
            }
        }
    }
}

function updateCustomFieldContent(sectionId, versionId, fieldId, content) {
    const section = customSections.find(s => s.id === sectionId);
    if (section) {
        const version = section.versions.find(v => v.id === versionId);
        if (version) {
            const field = version.fields.find(f => f.id === fieldId);
            if (field) {
                field.content = content;
                updateStats();
                markAsChanged();
            }
        }
    }
}

function removeCustomField(sectionId, versionId, fieldId) {
    const section = customSections.find(s => s.id === sectionId);
    if (section) {
        const version = section.versions.find(v => v.id === versionId);
        if (version && version.fields.length > 1) {
            version.fields = version.fields.filter(f => f.id !== fieldId);
            renderCustomContent();
            markAsChanged();
        } else {
            alert(t('keepOneField'));
        }
    }
}

function renderCustomContent() {
    renderAll();
}

function renderWorldBookContent() {
    renderAll();
}

function removeCustomVersion(sectionId, versionId) {
    return VersionCRUD.remove('custom', sectionId, versionId);
}

function removeCustomSection(sectionId) {
    return ItemCRUD.remove('custom', sectionId);
}

// 新增世界書
function addWorldBook() {
    return ItemCRUD.add('worldbook');
}


// 新增世界書版本
function addWorldBookVersion(worldBookId) {
    return VersionCRUD.add('worldbook', worldBookId);
}

// 複製世界書版本
function copyWorldBookVersion(worldBookId, versionId) {
    return VersionCRUD.copy('worldbook', worldBookId, versionId);
}

// 複製世界書
function copyWorldBook(worldBookId) {
    return ItemCRUD.copy('worldbook', worldBookId);
}

// 刪除世界書版本
function removeWorldBookVersion(worldBookId, versionId) {
    return VersionCRUD.remove('worldbook', worldBookId, versionId);
}

// 刪除世界書
function removeWorldBook(worldBookId) {
    return ItemCRUD.remove('worldbook', worldBookId);
}

// 更新世界書名稱
function updateWorldBookName(worldBookId, name) {
    updateItemName('worldbook', worldBookId, name);
}

// 更新世界書版本名稱
function updateWorldBookVersionName(worldBookId, versionId, name) {
    updateVersionName('worldbook', worldBookId, versionId, name);
}

// 新增條目
function addWorldBookEntry(worldBookId, versionId) {
    const worldBook = worldBooks.find(wb => wb.id === worldBookId);
    if (worldBook) {
        const version = worldBook.versions.find(v => v.id === versionId);
        if (version) {
            const newEntry = {
    id: generateId(),
    uid: version.entries.length,
    displayIndex: version.entries.length,
    key: [],
    keysecondary: [],
    content: '',
    comment: '',
    constant: false,
    vectorized: false,
    selective: true,
    selectiveLogic: 0,
    addMemo: true,
    useProbability: false,
    disable: false,
    order: 100,  // 在匯出時會轉為 insertion_order
    position: 0,
    excludeRecursion: false,
    preventRecursion: false,
    delayUntilRecursion: false,
    probability: 100,
    depth: 4,
    group: '',
    groupOverride: false,
    groupWeight: 100,
    scanDepth: null,
    caseSensitive: null,
    matchWholeWords: null,
    useGroupScoring: null,
    automationId: '',
    role: 0,
    sticky: 0,
    cooldown: 0,
    delay: 0,
    // 匹配選項
    matchPersonaDescription: false,
    matchCharacterDescription: false,
    matchCharacterPersonality: false,
    matchCharacterDepthPrompt: false,
    matchScenario: false,
    matchCreatorNotes: false
};
            version.entries.push(newEntry);
            renderAll();
            markAsChanged();
        }
    }
}

// 刪除條目
function removeWorldBookEntry(worldBookId, versionId, entryId) {
    const confirmDelete = confirm(t('deleteEntry') + '？\n\n⚠️ 刪除後無法復原！');
    
    if (confirmDelete) {
        const worldBook = worldBooks.find(wb => wb.id === worldBookId);
        if (worldBook) {
            const version = worldBook.versions.find(v => v.id === versionId);
            if (version) {
                version.entries = version.entries.filter(e => e.id !== entryId);
                renderWorldBookContent();
                markAsChanged();
            }
        }
    }
}

// 更新條目欄位
function updateWorldBookEntry(worldBookId, versionId, entryId, field, value) {
    const worldBook = worldBooks.find(wb => wb.id === worldBookId);
    if (worldBook) {
        const version = worldBook.versions.find(v => v.id === versionId);
        if (version) {
            const entry = version.entries.find(e => e.id === entryId);
            if (entry) {
                if (field === 'key' || field === 'keysecondary') {
                    entry[field] = value.split(',').map(k => k.trim()).filter(k => k);
                } else {
                    entry[field] = value;
                }
                markAsChanged();
            }
        }
    }
}

// 新增：更新條目模式
function updateEntryMode(worldBookId, versionId, entryId, mode) {
    const worldBook = worldBooks.find(wb => wb.id === worldBookId);
    if (worldBook) {
        const version = worldBook.versions.find(v => v.id === versionId);
        if (version) {
            const entry = version.entries.find(e => e.id === entryId);
            if (entry) {
                // 重置所有模式
                entry.constant = false;
                entry.vectorized = false;
                entry.selective = true;
                
                // 設定選中的模式
                switch (mode) {
                    case 'constant':
                        entry.constant = true;
                        break;
                    case 'vectorized':
                        entry.vectorized = true;
                        break;
                    case 'selective':
                    default:
                        entry.selective = true;
                        break;
                }
                markAsChanged();
            }
        }
    }
}

// 新增：切換條目啟用狀態
function toggleEntryEnabled(worldBookId, versionId, entryId) {
    const worldBook = worldBooks.find(wb => wb.id === worldBookId);
    if (worldBook) {
        const version = worldBook.versions.find(v => v.id === versionId);
        if (version) {
            const entry = version.entries.find(e => e.id === entryId);
            if (entry) {
                entry.disable = !entry.disable;
                
                // 更新拉霸視覺效果
                const entryPanel = document.querySelector(`[data-entry-id="${entryId}"]`);
                if (entryPanel) {
                    const toggleSwitch = entryPanel.querySelector('.toggle-switch');
                    const toggleBall = toggleSwitch.querySelector('div');
                    
                    if (!entry.disable) {
                        toggleSwitch.style.background = 'var(--success-color)';
                        toggleBall.style.left = '18px';
                    } else {
                        toggleSwitch.style.background = 'var(--border-color)';
                        toggleBall.style.left = '2px';
                    }
                }
                
                markAsChanged();
            }
        }
    }
}

        function updateEntryStatusIcon(entryId, entry) {
    // 找到對應條目的狀態圖示元素
    const entryPanel = document.querySelector(`[data-entry-id="${entryId}"]`);
    if (entryPanel) {
        const statusIcon = entryPanel.querySelector('.entry-status-icon');
        if (statusIcon) {
            // 更新圖示
            let icon = '';
            if (entry.constant) {
                icon = '🔵'; // 藍燈：常駐模式
            } else if (entry.vectorized) {
                icon = '🔗'; // 鏈接：向量化模式
            } else {
                icon = '🟢'; // 綠燈：選擇模式
            }
            statusIcon.textContent = icon;
        }
    }
}


// 匯入世界書
function importWorldBook() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = function(event) {
        handleWorldBookImport(event);
    };
    input.click();
}

// 處理世界書匯入
function handleWorldBookImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    ImportManager.handleImport(file, 'worldbook');
    event.target.value = ''; // 清空input值
}

// 匯入 SillyTavern 格式世界書
function importSillyTavernWorldBook(data, filename) {
    const worldBook = {
        id: generateId(),
        name: data.name || filename.replace('.json', '') || 'Imported Lorebook',
        description: data.description || '',
        versions: [{
            id: generateId(),
            name: 'Imported Version',
            entries: []
        }]
    };

    // 轉換條目格式
    const entries = Object.values(data.entries);
    worldBook.versions[0].entries = entries.map((entry, index) => {
        // 先建立基本屬性
        const baseEntry = {
            id: generateId(),
            uid: entry.uid || index,
            displayIndex: entry.displayIndex || index,
            key: Array.isArray(entry.key) ? entry.key : [],
            keysecondary: Array.isArray(entry.keysecondary) ? entry.keysecondary : [],
            content: entry.content || '',
            comment: entry.comment || '',
            constant: entry.constant || false,
            vectorized: entry.vectorized || false,
            selective: entry.selective !== false,
            selectiveLogic: entry.selectiveLogic || 0,
            addMemo: entry.addMemo !== false,
            useProbability: entry.useProbability || false,
            disable: entry.disable || false,
            order: entry.order || 100,
            depth: entry.depth || 4,
            probability: entry.probability || 100,
            position: entry.position || 0,
            role: entry.role || 0,
            excludeRecursion: entry.excludeRecursion || false,
            preventRecursion: entry.preventRecursion || false,
            matchPersonaDescription: entry.matchPersonaDescription || false,
            matchCharacterDescription: entry.matchCharacterDescription || false,
            matchCharacterPersonality: entry.matchCharacterPersonality || false,
            matchCharacterDepthPrompt: entry.matchCharacterDepthPrompt || false,
            matchScenario: entry.matchScenario || false,
            matchCreatorNotes: entry.matchCreatorNotes || false,
            delayUntilRecursion: entry.delayUntilRecursion || false,
            group: entry.group || '',
            groupOverride: entry.groupOverride || false,
            groupWeight: entry.groupWeight || 100,
            scanDepth: entry.scanDepth || null,
            caseSensitive: entry.caseSensitive || null,
            matchWholeWords: entry.matchWholeWords || null,
            useGroupScoring: entry.useGroupScoring || null,
            automationId: entry.automationId || '',
            sticky: entry.sticky || 0,
            cooldown: entry.cooldown || 0,
            delay: entry.delay || 0
        };
        
        // 定義已知的屬性鍵值
        const knownKeys = new Set(Object.keys(baseEntry));
        
        // 找出額外的未處理屬性
        const extraProperties = {};
        Object.keys(entry).forEach(key => {
            if (!knownKeys.has(key)) {
                extraProperties[key] = entry[key];
            }
        });
        
        // 合併基本屬性和額外屬性
        return { ...baseEntry, ...extraProperties };
    });

    worldBooks.push(worldBook);
    currentMode = 'worldbook';
    currentWorldBookId = worldBook.id;
    currentWorldBookVersionId = worldBook.versions[0].id;
    viewMode = 'single';
    compareVersions = [];
    renderAll();
    markAsChanged();
    alert(`世界書「${worldBook.name}」匯入成功！包含 ${entries.length} 個條目。`);
}



function updateEntryModeFromSelect(worldBookId, versionId, entryId, mode) {
    updateEntryMode(worldBookId, versionId, entryId, mode);
    // 不重新渲染，只更新狀態圖示
    const worldBook = worldBooks.find(wb => wb.id === worldBookId);
    if (worldBook) {
        const version = worldBook.versions.find(v => v.id === versionId);
        if (version) {
            const entry = version.entries.find(e => e.id === entryId);
            if (entry) {
                updateEntryStatusIcon(entryId, entry);
            }
        }
    }
}

function toggleLanguageMenu() {
    const menu = document.getElementById('lang-menu');
    const isVisible = menu.style.display !== 'none';
    
    if (isVisible) {
        menu.style.display = 'none';
    } else {
        menu.style.display = 'block';
        updateLanguageMenu();
    }
}
function updateLanguageMenu() {
    const options = document.querySelectorAll('.language-option');
    options.forEach(option => {
        const lang = option.getAttribute('onclick').match(/'(.+)'/)[1];
        if (lang === currentLang) {
            option.classList.add('active');
        } else {
            option.classList.remove('active');
        }
    });
}

function updateEntryMode(worldBookId, versionId, entryId, mode) {
    const worldBook = worldBooks.find(wb => wb.id === worldBookId);
    if (worldBook) {
        const version = worldBook.versions.find(v => v.id === versionId);
        if (version) {
            const entry = version.entries.find(e => e.id === entryId);
            if (entry) {
                // 重置所有模式
                entry.constant = false;
                entry.vectorized = false;
                entry.selective = true;
                
                // 設定選中的模式
                switch (mode) {
                    case 'constant':
                        entry.constant = true;
                        entry.selective = false;
                        break;
                    case 'vectorized':
                        entry.vectorized = true;
                        entry.selective = false;
                        break;
                    case 'selective':
                    default:
                        entry.selective = true;
                        break;
                }
                markAsChanged();
            }
        }
    }
}

function selectLanguage(lang) {
    switchLanguage(lang);
    
    // 隱藏選單
    document.getElementById('lang-menu').style.display = 'none';
    
    // 更新語言按鈕提示
    const langToggle = document.getElementById('lang-toggle');
    if (langToggle) {
        langToggle.title = lang === 'zh' ? t('langToggleZh') : t('langToggleEn');
    }
}


       function renderAll() {
    renderSidebar();
    renderContent();
    updateTotalStats();
    updateLanguageUI();
    updateSaveButtonStates();
    
    // 立即設定頂部欄樣式，避免閃現
    updateHeaderBarStyles();
    
    // 在所有渲染完成後，正確設定展開狀態
    setTimeout(() => {
        expandCurrentItemVersions();
        ScrollbarManager.initializeAll();
        StatsManager.updateAllVersionStatsWithTimestamp();
        
        // 強制更新所有文字框的滾動設定
        document.querySelectorAll('textarea.field-input').forEach(textarea => {
            textarea.style.overflowY = 'auto';
        });
    }, 50);
}

// 新增函數：立即更新頂部欄樣式
function updateHeaderBarStyles() {
    const headerBar = document.querySelector('.character-header-bar');
    if (headerBar) {
        // 移除所有模式class
        headerBar.classList.remove('single-mode', 'compare-mode');
        
        // 添加對應的模式class
        if (viewMode === 'compare') {
            headerBar.classList.add('compare-mode');
        } else {
            headerBar.classList.add('single-mode');
        }
    }
}
function updateLanguageUI() {
    // 更新側邊欄標題
    const sidebarTitle = document.querySelector('.sidebar-app-title');
    if (sidebarTitle) sidebarTitle.textContent = t('appTitle');
    
    // 更新底部提示文字（現在在 sidebar-footer 中）
    const sidebarFooterText = document.querySelector('.sidebar-footer-text');
    if (sidebarFooterText) sidebarFooterText.textContent = t('appSubtitle');
    
    // 確保按鈕狀態正確顯示
    updateSaveButtonStates();
}

// 側邊欄摺疊功能
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const icon = document.getElementById('sidebar-toggle-icon');
    sidebar.classList.toggle('collapsed');

    if (sidebar.classList.contains('collapsed')) {
        icon.textContent = '⇥';
    } else {
        icon.textContent = '⇤';
    }
}

// 新增展開側邊欄函數
function expandSidebar() {
    const sidebar = document.getElementById('sidebar');
    const icon = document.getElementById('sidebar-toggle-icon');
    
    sidebar.classList.remove('collapsed');
    icon.style.display = 'flex';
    icon.textContent = '⇤';
    
    // 移除點擊展開功能
    sidebar.removeEventListener('click', expandSidebar);
}

function triggerImageUpload(characterId, versionId) {
    document.getElementById(`avatar-upload-${versionId}`).click();
}

       function updateTotalStats() {
    const statsBar = document.querySelector('.stats-bar .total-stats');
    if (!statsBar) return;
    
    if (viewMode === 'compare') {
        // 對比模式：顯示每個版本的詳細統計
        const compareStats = StatsManager.calculateTotalStatsForCompare();
        
        let statsHTML = '';
        compareStats.forEach(stat => {
            statsHTML += `<div>${stat.name} - ${stat.chars} ${t('chars')} / ${stat.tokens} ${t('tokens')}</div>`;
        });
        
        statsBar.innerHTML = `
            <div style="font-weight: 600; font-size: 1.1em; color: var(--text-color); margin-bottom: 8px; border-bottom: 1px solid var(--border-color); padding-bottom: 4px;">${t('total')}</div>
            ${statsHTML}
        `;
    } else {
        // 單一檢視：顯示單個版本統計
        const { chars, tokens } = StatsManager.calculateTotalStatsForSingle();
        statsBar.innerHTML = `${t('total')} - <span id="total-chars">${chars}</span> ${t('chars')} / <span id="total-tokens">${tokens}</span> ${t('tokens')}`;
    }
}

        // 統一的匯出管理器
// 統一的匯出管理器
class ExportManager {
    static export(type, itemId, format) {
        const item = ItemManager.getItemsArray(type).find(i => i.id === itemId);
        if (!item) return;

        if (item.versions.length === 1) {
            this.downloadItem(item, item.versions[0], type, format);
        } else {
            const versionIndex = prompt(t('selectVersion', item.versions.length));
            const index = parseInt(versionIndex) - 1;
            if (index >= 0 && index < item.versions.length) {
                this.downloadItem(item, item.versions[index], type, format);
            }
        }
    }

    static downloadItem(item, version, type, format) {
        switch (type) {
            case 'character':
                if (format === 'json') {
                    this.downloadCharacterJSON(item, version);
                } else if (format === 'png') {
                    this.exportCharacterPNG(item, version);
                }
                break;
            case 'worldbook':
                this.downloadWorldBookJSON(item, version);
                break;
            case 'custom':
                if (format === 'txt') {
                    this.downloadCustomTXT(item, version);
                } else if (format === 'markdown') {
                    this.downloadCustomMarkdown(item, version);
                }
                break;
        }
    }

    // 角色 JSON 匯出
static downloadCharacterJSON(character, version) {
    const characterData = this.createCharacterData(character, version);
    const blob = new Blob([JSON.stringify(characterData, null, 4)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${character.name}_${version.name}.json`; // 注意：加上版本名稱避免重複
    a.click();
    URL.revokeObjectURL(url);
}

    // 角色 PNG 匯出
    static exportCharacterPNG(character, version) {
        const characterData = this.createCharacterData(character, version);
        const jsonString = JSON.stringify(characterData);
        const base64Data = btoa(unescape(encodeURIComponent(jsonString)));
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (version.avatar) {
            const img = new Image();
            img.onload = function() {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                createPNGWithMetadata(canvas, base64Data, character.name);
            };
            img.src = version.avatar;
        } else {
            this.createDefaultCharacterImage(canvas, ctx, character.name);
            createPNGWithMetadata(canvas, base64Data, character.name);
        }
    }

  // 世界書 JSON 匯出
static downloadWorldBookJSON(worldBook, version) {
    const exportData = {
        name: worldBook.name,
        description: worldBook.description || '',
        entries: {}
    };

    // 轉換為 SillyTavern 格式
    version.entries.forEach((entry, index) => {
        // 先建立基本的匯出屬性
        const baseExport = {
            uid: index,
            key: entry.key,
            keysecondary: entry.keysecondary,
            comment: entry.comment,
            content: entry.content,
            constant: entry.constant,
            vectorized: entry.vectorized || false,
            selective: entry.selective,
            selectiveLogic: entry.selectiveLogic || 0,
            addMemo: entry.addMemo !== false,
            order: entry.order || 100,
            position: entry.position || 0,
            disable: entry.disable || false,
            excludeRecursion: entry.excludeRecursion || false,
            preventRecursion: entry.preventRecursion || false,
            matchPersonaDescription: entry.matchPersonaDescription || false,
            matchCharacterDescription: entry.matchCharacterDescription || false,
            matchCharacterPersonality: entry.matchCharacterPersonality || false,
            matchCharacterDepthPrompt: entry.matchCharacterDepthPrompt || false,
            matchScenario: entry.matchScenario || false,
            matchCreatorNotes: entry.matchCreatorNotes || false,
            delayUntilRecursion: entry.delayUntilRecursion || false,
            probability: entry.probability || 100,
            useProbability: entry.useProbability || false,
            depth: entry.depth || 4,
            group: entry.group || '',
            groupOverride: entry.groupOverride || false,
            groupWeight: entry.groupWeight || 100,
            scanDepth: entry.scanDepth || null,
            caseSensitive: entry.caseSensitive || null,
            matchWholeWords: entry.matchWholeWords || null,
            useGroupScoring: entry.useGroupScoring || null,
            automationId: entry.automationId || '',
            role: entry.role || 0,
            sticky: entry.sticky || 0,
            cooldown: entry.cooldown || 0,
            delay: entry.delay || 0,
            displayIndex: index
        };
        
        // 添加任何未處理的額外屬性（排除編輯器專用屬性）
        const knownKeys = new Set([...Object.keys(baseExport), 'id']); // 排除 'id'
        const extraProperties = {};
        Object.keys(entry).forEach(key => {
            if (!knownKeys.has(key)) {
                extraProperties[key] = entry[key];
            }
        });
        
        // 合併基本屬性和額外屬性
        exportData.entries[index.toString()] = { ...baseExport, ...extraProperties };
    });

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${worldBook.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

    // 自定義筆記 TXT 匯出
    static downloadCustomTXT(section, version) {
        let content = `${section.name} - ${version.name}\n`;
        content += `${'='.repeat(content.length - 1)}\n\n`;
        
        version.fields.forEach(field => {
            if (field.content.trim()) {
                content += `${field.name}:\n`;
                content += `${'-'.repeat(field.name.length + 1)}\n`;
                content += `${field.content.trim()}\n\n`;
            }
        });
        
        // 添加統計資訊
        const allText = version.fields.map(field => field.content).filter(Boolean).join(' ');
        const chars = allText.length;
        const tokens = countTokens(allText);
        content += `\n統計資訊:\n`;
        content += `字數: ${chars}\n`;
        content += `Token數: ${tokens}\n`;
        content += `匯出時間: ${new Date().toLocaleString()}\n`;

        const blob = new Blob([content], { type: 'text/plain; charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${section.name}_${version.name}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // 自定義筆記 Markdown 匯出
    static downloadCustomMarkdown(section, version) {
        let content = `# ${section.name} - ${version.name}\n\n`;
        
        version.fields.forEach(field => {
            if (field.content.trim()) {
                content += `## ${field.name}\n\n`;
                content += `${field.content.trim()}\n\n`;
            }
        });
        
        // 添加統計資訊
        const allText = version.fields.map(field => field.content).filter(Boolean).join(' ');
        const chars = allText.length;
        const tokens = countTokens(allText);
        content += `---\n\n`;
        content += `### 統計資訊\n\n`;
        content += `- **字數**: ${chars}\n`;
        content += `- **Token數**: ${tokens}\n`;
        content += `- **匯出時間**: ${new Date().toLocaleString()}\n`;

        const blob = new Blob([content], { type: 'text/markdown; charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${section.name}_${version.name}.md`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // 創建角色資料結構
    static createCharacterData(character, version) {
        return {
            name: character.name,
            description: version.description,
            personality: version.personality,
            scenario: version.scenario,
            first_mes: version.firstMessage,
            mes_example: version.dialogue,
            creatorcomment: version.creatorNotes,
            avatar: "none",
            talkativeness: "0.5",
            fav: false,
            tags: version.tags ? version.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [],
            spec: "chara_card_v3",
            spec_version: "3.0",
            data: {
                name: character.name,
                description: version.description,
                personality: version.personality,
                scenario: version.scenario,
                first_mes: version.firstMessage,
                mes_example: version.dialogue,
                creator_notes: version.creatorNotes,
                system_prompt: "",
                post_history_instructions: "",
                tags: version.tags ? version.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [],
                creator: version.creator,
                character_version: version.charVersion,
                alternate_greetings: [],
                extensions: {
                    talkativeness: "0.5",
                    fav: false,
                    world: "",
                    depth_prompt: {
                        prompt: "",
                        depth: 4,
                        role: "system"
                    }
                },
                group_only_greetings: []
            },
            create_date: new Date().toLocaleString('zh-TW', {
                year: 'numeric',
                month: 'numeric', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }).replace(/\//g, '-').replace(',', ' @').replace(/:/g, 'h ').replace(/(\d+)$/, '$1s') + ' ' + new Date().getMilliseconds() + 'ms'
        };
    }

    // 創建預設角色圖片
    static createDefaultCharacterImage(canvas, ctx, characterName) {
        canvas.width = 400;
        canvas.height = 600;
        
        const gradient = ctx.createLinearGradient(0, 0, 0, 600);
        gradient.addColorStop(0, '#f7f5f3');
        gradient.addColorStop(1, '#e2e8f0');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 400, 600);
        
        ctx.fillStyle = '#2d3748';
        ctx.font = 'bold 24px "Noto Serif CJK JP", serif';
        ctx.textAlign = 'center';
        ctx.fillText(characterName, 200, 300);
        
        ctx.font = '16px "Noto Serif CJK JP", serif';
        ctx.fillStyle = '#718096';
        ctx.fillText('Character Card', 200, 330);
    }

    // 添加在 ExportManager 類別的最後，} 之前
static downloadWorldBookJSON(worldBook, version) {
    // 將原本的 downloadWorldBook 函數內容移到這裡
    const exportData = {
        name: worldBook.name,
        description: worldBook.description || '',
        entries: {}
    };

    // 轉換為 SillyTavern 格式
    version.entries.forEach((entry, index) => {
        exportData.entries[index.toString()] = {
            uid: index,
            key: entry.key,
            keysecondary: entry.keysecondary,
            comment: entry.comment,
            content: entry.content,
            constant: entry.constant,
            vectorized: entry.vectorized || false,
            selective: entry.selective,
            selectiveLogic: entry.selectiveLogic || 0,
            addMemo: entry.addMemo !== false,
            order: entry.order || 100,
            position: entry.position || 0,
            disable: entry.disable || false,
            excludeRecursion: entry.excludeRecursion || false,
            preventRecursion: entry.preventRecursion || false,
            matchPersonaDescription: entry.matchPersonaDescription || false,
            matchCharacterDescription: entry.matchCharacterDescription || false,
            matchCharacterPersonality: entry.matchCharacterPersonality || false,
            matchCharacterDepthPrompt: entry.matchCharacterDepthPrompt || false,
            matchScenario: entry.matchScenario || false,
            matchCreatorNotes: entry.matchCreatorNotes || false,
            delayUntilRecursion: entry.delayUntilRecursion || false,
            probability: entry.probability || 100,
            useProbability: entry.useProbability || false,
            depth: entry.depth || 4,
            group: entry.group || '',
            groupOverride: entry.groupOverride || false,
            groupWeight: entry.groupWeight || 100,
            scanDepth: entry.scanDepth || null,
            caseSensitive: entry.caseSensitive || null,
            matchWholeWords: entry.matchWholeWords || null,
            useGroupScoring: entry.useGroupScoring || null,
            automationId: entry.automationId || '',
            role: entry.role || 0,
            sticky: entry.sticky || 0,
            cooldown: entry.cooldown || 0,
            delay: entry.delay || 0,
            displayIndex: index
        };
    });

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${worldBook.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
}
}

// 更新原有的匯出函數使用新的管理器
function exportJSON(characterId) {
    ExportManager.export('character', characterId, 'json');
}

function exportPNG(characterId) {
    ExportManager.export('character', characterId, 'png');
}

function exportWorldBook(worldBookId) {
    ExportManager.export('worldbook', worldBookId, 'json');
}

function exportCustomTXT(sectionId) {
    ExportManager.export('custom', sectionId, 'txt');
}

function exportCustomMarkdown(sectionId) {
    ExportManager.export('custom', sectionId, 'markdown');
}



        function createPNGWithMetadata(canvas, base64Data, characterName, callback) {
    // 將Canvas轉為ImageData
    canvas.toBlob(function(blob) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const arrayBuffer = e.target.result;
            const uint8Array = new Uint8Array(arrayBuffer);
            
            // 在PNG中嵌入tEXt chunk with "chara" keyword
            const modifiedPNG = addTextChunkToPNG(uint8Array, 'chara', base64Data);
            
            // 下載修改後的PNG
            const modifiedBlob = new Blob([modifiedPNG], { type: 'image/png' });
            const url = URL.createObjectURL(modifiedBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${characterName}.png`;
            a.click();
            URL.revokeObjectURL(url);
            
            // 呼叫回調函數（如果有提供）
            if (callback) {
                setTimeout(callback, 100);
            }
        };
        reader.readAsArrayBuffer(blob);
    }, 'image/png');
}

        function addTextChunkToPNG(pngData, keyword, text) {
            // PNG檔案結構：8位元組PNG簽名 + 數個chunks + IEND chunk
            const signature = pngData.slice(0, 8);
            let pos = 8;
            const chunks = [];
            
            // 讀取所有現有的chunks
            while (pos < pngData.length) {
                const length = (pngData[pos] << 24) | (pngData[pos + 1] << 16) | (pngData[pos + 2] << 8) | pngData[pos + 3];
                const type = String.fromCharCode(pngData[pos + 4], pngData[pos + 5], pngData[pos + 6], pngData[pos + 7]);
                const chunkData = pngData.slice(pos, pos + 12 + length);
                
                chunks.push(chunkData);
                
                if (type === 'IEND') break;
                pos += 12 + length;
            }
            
            // 創建tEXt chunk
            const keywordBytes = new TextEncoder().encode(keyword);
            const textBytes = new TextEncoder().encode(text);
            const chunkData = new Uint8Array(keywordBytes.length + 1 + textBytes.length);
            chunkData.set(keywordBytes, 0);
            chunkData[keywordBytes.length] = 0; // null separator
            chunkData.set(textBytes, keywordBytes.length + 1);
            
            // 計算CRC
            const crc = calculateCRC32([0x74, 0x45, 0x58, 0x74, ...chunkData]); // "tEXt" + data
            
            // 組裝tEXt chunk
            const textChunk = new Uint8Array(12 + chunkData.length);
            const lengthBytes = [(chunkData.length >>> 24) & 0xFF, (chunkData.length >>> 16) & 0xFF, (chunkData.length >>> 8) & 0xFF, chunkData.length & 0xFF];
            textChunk.set(lengthBytes, 0);
            textChunk.set([0x74, 0x45, 0x58, 0x74], 4); // "tEXt"
            textChunk.set(chunkData, 8);
            textChunk.set([(crc >>> 24) & 0xFF, (crc >>> 16) & 0xFF, (crc >>> 8) & 0xFF, crc & 0xFF], 8 + chunkData.length);
            
            // 重新組裝PNG：簽名 + 原有chunks (除了IEND) + tEXt chunk + IEND
            const iendChunk = chunks.pop(); // 移除IEND
            const totalLength = signature.length + chunks.reduce((sum, chunk) => sum + chunk.length, 0) + textChunk.length + iendChunk.length;
            const result = new Uint8Array(totalLength);
            
            let offset = 0;
            result.set(signature, offset);
            offset += signature.length;
            
            for (const chunk of chunks) {
                result.set(chunk, offset);
                offset += chunk.length;
            }
            
            result.set(textChunk, offset);
            offset += textChunk.length;
            
            result.set(iendChunk, offset);
            
            return result;
        }

        function calculateCRC32(data) {
            const crcTable = [];
            for (let i = 0; i < 256; i++) {
                let c = i;
                for (let j = 0; j < 8; j++) {
                    if (c & 1) {
                        c = 0xEDB88320 ^ (c >>> 1);
                    } else {
                        c = c >>> 1;
                    }
                }
                crcTable[i] = c;
            }
            
            let crc = 0xFFFFFFFF;
            for (let i = 0; i < data.length; i++) {
                crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
            }
            return (crc ^ 0xFFFFFFFF) >>> 0;
        }

            let selectedExportFormat = null;


       function exportAllVersions(characterId) {
    const character = characters.find(c => c.id === characterId);
    if (!character) return;

    ModalManager.exportFormatSelector({
        characterName: character.name,
        versionCount: character.versions.length,
        onFormatSelect: (format) => {
            // 重置選擇
            selectedExportFormat = null;
            
            // 顯示進度通知
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: var(--primary-color);
                color: white;
                padding: 16px 24px;
                border-radius: 8px;
                font-size: 0.9em;
                font-weight: 500;
                z-index: 9999;
                box-shadow: var(--shadow-large);
                max-width: 300px;
            `;
            notification.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3); border-top: 2px solid white; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                    <div>
                        <div>${t('exporting', character.versions.length)}</div>
                        <div style="font-size: 0.8em; opacity: 0.8; margin-top: 4px;" id="export-progress">${t('preparing')}</div>
                    </div>
                </div>
            `;
            
            // 添加旋轉動畫
            if (!document.getElementById('spin-animation')) {
                const style = document.createElement('style');
                style.id = 'spin-animation';
                style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
                document.head.appendChild(style);
            }
            
            document.body.appendChild(notification);
            
            // 開始批次匯出
            if (format === 'json') {
                exportAllVersionsJSON(character, notification);
            } else {
                exportAllVersionsPNG(character, notification);
            }
        }
    });
}

// 統一的選擇器函數
function selectItem(type, itemId, versionId = null) {
    isHomePage = false;
    currentMode = type;
    viewMode = 'single';
    compareVersions = [];
    
    switch (type) {
        case 'character':
            currentCharacterId = itemId;
            if (versionId) {
                currentVersionId = versionId;
            } else {
                const character = characters.find(c => c.id === itemId);
                if (character) {
                    currentVersionId = character.versions[0].id;
                }
            }
            break;
            
        case 'custom':
            currentCustomSectionId = itemId;
            if (versionId) {
                currentCustomVersionId = versionId;
            } else {
                const section = customSections.find(s => s.id === itemId);
                if (section) {
                    currentCustomVersionId = section.versions[0].id;
                }
            }
            break;
            
        case 'worldbook':
            currentWorldBookId = itemId;
            if (versionId) {
                currentWorldBookVersionId = versionId;
            } else {
                const worldBook = worldBooks.find(wb => wb.id === itemId);
                if (worldBook) {
                    currentWorldBookVersionId = worldBook.versions[0].id;
                }
            }
            break;
    }
    
    renderAll();
}


function exportAllVersionsJSON(character, notification) {
    const progressElement = notification.querySelector('#export-progress');
    
    character.versions.forEach((version, index) => {
        setTimeout(() => {
            progressElement.textContent = `JSON ${index + 1}/${character.versions.length}: ${version.name}`;
            
            // 使用 ExportManager 的方法，而不是調用 downloadJSON
            ExportManager.downloadCharacterJSON(character, version);
            
            // 最後一個檔案匯出完成
            if (index === character.versions.length - 1) {
                setTimeout(() => {
                    notification.remove();
                    showCompletionNotification(character.versions.length, 'JSON');
                }, 500);
            }
        }, index * 300); // 每個檔案間隔300ms
    });
}

function exportAllVersionsPNG(character, notification) {
    const progressElement = notification.querySelector('#export-progress');
    let completed = 0;
    
    character.versions.forEach((version, index) => {
        setTimeout(() => {
            progressElement.textContent = `PNG ${index + 1}/${character.versions.length}: ${version.name}`;
            
            // 為PNG匯出創建特殊的完成回調
            exportVersionPNG(character, version, () => {
                completed++;
                if (completed === character.versions.length) {
                    notification.remove();
                    showCompletionNotification(character.versions.length, 'PNG');
                }
            });
        }, index * 800); // PNG需要更長間隔，因為處理時間較長
    });
}

function exportVersionPNG(character, version, callback) {
    // 創建與原exportPNG相同的資料結構
    const characterData = {
        name: character.name,
        description: version.description,
        personality: version.personality,
        scenario: version.scenario,
        first_mes: version.firstMessage,
        mes_example: version.dialogue,
        creatorcomment: version.creatorNotes,
        avatar: "none",
        talkativeness: "0.5",
        fav: false,
        tags: version.tags ? version.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [],
        spec: "chara_card_v3",
        spec_version: "3.0",
        data: {
            name: character.name,
            description: version.description,
            personality: version.personality,
            scenario: version.scenario,
            first_mes: version.firstMessage,
            mes_example: version.dialogue,
            creator_notes: version.creatorNotes,
            system_prompt: "",
            post_history_instructions: "",
            tags: version.tags ? version.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [],
            creator: version.creator,
            character_version: version.charVersion,
            alternate_greetings: [],
            extensions: {
                talkativeness: "0.5",
                fav: false,
                world: "",
                depth_prompt: {
                    prompt: "",
                    depth: 4,
                    role: "system"
                }
            },
            group_only_greetings: []
        },
        create_date: new Date().toLocaleString('zh-TW', {
            year: 'numeric',
            month: 'numeric', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }).replace(/\//g, '-').replace(',', ' @').replace(/:/g, 'h ').replace(/(\d+)$/, '$1s') + ' ' + new Date().getMilliseconds() + 'ms'
    };

    // 將JSON轉為Base64
    const jsonString = JSON.stringify(characterData);
    const base64Data = btoa(unescape(encodeURIComponent(jsonString)));

    // 創建或使用現有的頭像圖片
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (version.avatar) {
        // 如果有頭像，使用頭像作為PNG圖片
        const img = new Image();
        img.onload = function() {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            // 嵌入chara metadata並下載
            createPNGWithMetadata(canvas, base64Data, `${character.name}_${version.name}`, callback);
        };
        img.src = version.avatar;
    } else {
        // 如果沒有頭像，創建預設圖片
        canvas.width = 400;
        canvas.height = 600;
        
        // 創建漸層背景
        const gradient = ctx.createLinearGradient(0, 0, 0, 600);
        gradient.addColorStop(0, '#f7f5f3');
        gradient.addColorStop(1, '#e2e8f0');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 400, 600);
        
        // 添加角色名稱
        ctx.fillStyle = '#2d3748';
        ctx.font = 'bold 24px "Noto Serif CJK JP", serif';
        ctx.textAlign = 'center';
        ctx.fillText(character.name, 200, 280);
        
        // 添加版本名稱
        ctx.font = '18px "Noto Serif CJK JP", serif';
        ctx.fillStyle = '#718096';
        ctx.fillText(version.name, 200, 310);
        
        // 添加副標題
        ctx.font = '16px "Noto Serif CJK JP", serif';
        ctx.fillText('Character Card', 200, 340);
        
        // 嵌入chara metadata並下載
        createPNGWithMetadata(canvas, base64Data, `${character.name}_${version.name}`, callback);
    }
}

function showCompletionNotification(count, format) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--success-color);
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        font-size: 0.9em;
        font-weight: 500;
        z-index: 9999;
        box-shadow: var(--shadow-large);
        transform: translateX(100%);
        transition: transform 0.3s ease;
    `;
    notification.innerHTML = t('exportComplete', count, format);
    
    document.body.appendChild(notification);
    
    // 滑入動畫
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 10);
    
    // 3秒後移除
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

        function importCharacter() {
            document.getElementById('importFile').click();
        }

        function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    ImportManager.handleImport(file, 'character');
    event.target.value = ''; // 清空input值
}

        function extractCharaFromPNG(pngData) {
            // 跳過PNG簽名
            let pos = 8;
            
            while (pos < pngData.length) {
                // 讀取chunk長度
                const length = (pngData[pos] << 24) | (pngData[pos + 1] << 16) | (pngData[pos + 2] << 8) | pngData[pos + 3];
                
                // 讀取chunk類型
                const type = String.fromCharCode(pngData[pos + 4], pngData[pos + 5], pngData[pos + 6], pngData[pos + 7]);
                
                if (type === 'tEXt') {
                    // 讀取tEXt chunk的資料
                    const textData = pngData.slice(pos + 8, pos + 8 + length);
                    
                    // 尋找null分隔符
                    let nullPos = -1;
                    for (let i = 0; i < textData.length; i++) {
                        if (textData[i] === 0) {
                            nullPos = i;
                            break;
                        }
                    }
                    
                    if (nullPos !== -1) {
                        // 提取keyword和text
                        const keyword = new TextDecoder().decode(textData.slice(0, nullPos));
                        const text = new TextDecoder().decode(textData.slice(nullPos + 1));
                        
                        if (keyword === 'chara') {
                            return text;
                        }
                    }
                }
                
                if (type === 'IEND') break;
                pos += 12 + length;
            }
            
            return null;
        }


// 切換條目內容展開/收合
function toggleEntryContent(entryId) {
    const content = document.getElementById(`entry-content-${entryId}`);
    const toggleBtn = document.querySelector(`[onclick="toggleEntryContent('${entryId}')"]`);
    
    if (!content || !toggleBtn) return;
    
    const isExpanded = content.style.display !== 'none';
    
    if (isExpanded) {
        // 收合
        content.style.display = 'none';
        toggleBtn.innerHTML = '<span class="arrow-icon arrow-right"></span>';
    } else {
        // 展開
        content.style.display = 'block';
        toggleBtn.innerHTML = '<span class="arrow-icon arrow-down"></span>';
    }
}

// 複製世界書條目
function copyWorldBookEntry(worldBookId, versionId, entryId) {
    const worldBook = worldBooks.find(wb => wb.id === worldBookId);
    if (worldBook) {
        const version = worldBook.versions.find(v => v.id === versionId);
        if (version) {
            const originalEntry = version.entries.find(e => e.id === entryId);
            if (originalEntry) {
                const newEntry = {
                    ...originalEntry,
                    id: generateId(),
                    uid: version.entries.length,
                    comment: (originalEntry.comment || '') + ' - Copy'
                };
                
                version.entries.push(newEntry);
                renderAll();
                markAsChanged();
            }
        }
    }
}

// 確認刪除世界書條目
function confirmRemoveWorldBookEntry(worldBookId, versionId, entryId) {
    const confirmDelete = confirm(t('deleteEntryConfirm'));
    
    if (confirmDelete) {
        removeWorldBookEntry(worldBookId, versionId, entryId);
    }
}

        function importCharacterFromData(data) {
    const characterName = data.name || 'Imported Character';
    
    // 檢查是否已存在同名角色
    const existingCharacter = characters.find(c => c.name === characterName);
    
    if (existingCharacter) {
        // 詢問用戶要如何處理
        const choice = confirm(
            `已存在角色「${characterName}」！\n\n` +
            `點擊「確定」：新增為該角色的新版本\n` +
            `點擊「取消」：創建為新的獨立角色`
        );
        
        if (choice) {
            // 新增為現有角色的新版本
            addVersionToExistingCharacter(existingCharacter, data);
        } else {
            // 創建新角色（重命名）
            createNewCharacterFromImport(data, characterName);
        }
    } else {
        // 直接創建新角色
        createNewCharacterFromImport(data, characterName);
    }
}
function addVersionToExistingCharacter(existingCharacter, data) {
    // 計算新版本的名稱
    const newVersionNumber = existingCharacter.versions.length + 1;
    let versionName = `Version ${newVersionNumber}`;
    
    // 如果原始資料有指定版本名稱，使用它
    if (data.data?.character_version || data.character_version) {
        versionName = data.data?.character_version || data.character_version;
    }
    
    // 檢查版本名稱是否重複，如果重複就加上編號
    const existingVersionNames = existingCharacter.versions.map(v => v.name);
    let finalVersionName = versionName;
    let counter = 1;
    while (existingVersionNames.includes(finalVersionName)) {
        finalVersionName = `${versionName} (${counter})`;
        counter++;
    }
    
    const newVersion = {
        id: generateId(),
        name: finalVersionName,
        avatar: data.avatar && data.avatar !== 'none' ? data.avatar : '',
        creator: data.data?.creator || data.creator || '',
        charVersion: data.data?.character_version || data.character_version || '',
        creatorNotes: data.data?.creator_notes || data.creatorcomment || '',
        tags: Array.isArray(data.tags) ? data.tags.join(', ') : (data.data?.tags ? data.data.tags.join(', ') : ''),
        description: data.data?.description || data.description || '',
        personality: data.data?.personality || data.personality || '',
        scenario: data.data?.scenario || data.scenario || '',
        dialogue: data.data?.mes_example || data.mes_example || '',
        firstMessage: data.data?.first_mes || data.first_mes || ''
    };
    
    // 將新版本加入現有角色
    existingCharacter.versions.push(newVersion);
    
    // 切換到該角色和新版本
    currentCharacterId = existingCharacter.id;
    currentVersionId = newVersion.id;
    currentMode = 'character';
    isHomePage = false;
    
    renderAll();
    markAsChanged();
    
    alert(t('versionAddedSuccess', finalVersionName, existingCharacter.name));
}



function createNewCharacterFromImport(data, originalName) {
    // 找到一個不重複的角色名稱
    let characterName = originalName;
    const existingNames = characters.map(c => c.name);
    let counter = 1;
    
    while (existingNames.includes(characterName)) {
        characterName = `${originalName} (${counter})`;
        counter++;
    }
    
    const character = {
        id: generateId(),
        name: characterName,
        versions: [{
            id: generateId(),
            name: 'Imported Version',
            avatar: data.avatar && data.avatar !== 'none' ? data.avatar : '',
            creator: data.data?.creator || data.creator || '',
            charVersion: data.data?.character_version || data.character_version || '',
            creatorNotes: data.data?.creator_notes || data.creatorcomment || '',
            tags: Array.isArray(data.tags) ? data.tags.join(', ') : (data.data?.tags ? data.data.tags.join(', ') : ''),
            description: data.data?.description || data.description || '',
            personality: data.data?.personality || data.personality || '',
            scenario: data.data?.scenario || data.scenario || '',
            dialogue: data.data?.mes_example || data.mes_example || '',
            firstMessage: data.data?.first_mes || data.first_mes || ''
        }]
    };
    
    characters.push(character);
    currentCharacterId = character.id;
    currentVersionId = character.versions[0].id;
    currentMode = 'character';
    isHomePage = false;
    
    renderAll();
    markAsChanged();
    
    const message = characterName === originalName ? 
        t('importSuccess') : 
        t('importRenamedSuccess', characterName);
    alert(message);
}



document.addEventListener('click', function(e) {
            const langContainer = document.querySelector('.language-menu-container');
            const langMenu = document.getElementById('lang-menu');
            
            if (langContainer && !langContainer.contains(e.target) && langMenu) {
                langMenu.style.display = 'none';
            }
        });

                // 顯示清空資料確認對話框
        function showClearDataConfirm() {
            ModalManager.clearDataConfirm();
        }


        function exportAllDataFromModal() {
            DataManager.exportAllFromModal();
        }

        // 顯示清空成功通知
        function showClearSuccessNotification() {
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: var(--success-color);
                color: white;
                padding: 16px 24px;
                border-radius: 8px;
                font-size: 0.9em;
                font-weight: 500;
                z-index: 9999;
                box-shadow: var(--shadow-large);
                transform: translateX(100%);
                transition: transform 0.3s ease;
            `;
            notification.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 1.2em;">🗑️</span>
                    <div>
                        <div>${t('dataCleared')}</div>
                        <div style="font-size: 0.8em; opacity: 0.9; margin-top: 4px;">頁面已重置為初始狀態</div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.style.transform = 'translateX(0)';
            }, 10);
            
            setTimeout(() => {
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }, 4000);
        }

// ===== 應用初始化更新 =====
async function initApp() {
    console.log('🚀 初始化應用程式...');
    
    // 1. 初始化 tiktoken
    initTiktoken();
    
    // 2. 初始化翻譯系統
    await initTranslations();
    
    // 3. 載入自訂顏色
    const savedColors = localStorage.getItem('characterCreatorCustomColors');
    if (savedColors) {
        const colors = JSON.parse(savedColors);
        const root = document.documentElement;
        Object.entries(colors).forEach(([key, value]) => {
            const cssVar = key === 'textColor' ? '--text-color' : 
                          key === 'textMuted' ? '--text-muted' : 
                          key === 'borderColor' ? '--border-color' :
                          key === 'headerBg' ? '--header-bg' :
                          key === 'sidebarBg' ? '--sidebar-bg' :
                          key === 'mainContentBg' ? '--main-content-bg' :
                          key === 'contentBg' ? '--content-bg' :
                          `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}-color`;
            root.style.setProperty(cssVar, value);
        });
    }

    // 4. 離開頁面前的警告
    window.addEventListener('beforeunload', function(e) {
        if (hasUnsavedChanges) {
            const message = t('unsavedWarning');
            e.preventDefault();
            e.returnValue = message;
            return message;
        }
    });

    // 5. 載入角色資料
    await loadData();

    // 6. 確保有正確的初始狀態
    if (!currentMode) {
        currentMode = 'character';
    }

    // 確保預設狀態是收合的
    isHomePage = true;
    currentCharacterId = null;
    currentVersionId = null;
    currentCustomSectionId = null;
    currentCustomVersionId = null;
    currentWorldBookId = null;
    currentWorldBookVersionId = null;

    // 7. 等待翻譯載入完成後再渲染
    if (translationsReady) {
        renderAll();
        updateLanguageUI();
        updateSaveButtonStates();
    } else {
        // 備援：即使翻譯未完全載入也要渲染基本界面
        console.warn('⚠️ 翻譯未完全載入，使用備援渲染');
        setTimeout(() => {
            renderAll();
        }, 100);
    }

    // 添加儲存空間指示器（延遲執行）
    setTimeout(() => {
        addStorageIndicator();
    }, 100);

    // 定期更新統計
    setInterval(updateTotalStats, 2000);
    
    // 滾動條初始化
    ScrollbarManager.initializeAll();
    
    // 強制更新所有文字框的滾動設定
    setTimeout(() => {
        document.querySelectorAll('textarea.field-input').forEach(textarea => {
            textarea.style.overflowY = 'auto';
        });
    }, 200);

    // 應式處理
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) {
            document.getElementById('sidebar').classList.remove('show');
        }
    });
}

// ===== 更新的語言UI函數（獨立函數）=====
function updateLanguageUI() {
    // 更新側邊欄標題
    const sidebarTitle = document.querySelector('.sidebar-app-title');
    if (sidebarTitle) sidebarTitle.textContent = t('appTitle');
    
    // 更新底部提示文字
    const sidebarFooterText = document.querySelector('.sidebar-footer-text');
    if (sidebarFooterText) sidebarFooterText.textContent = t('appSubtitle');
    
    // 更新頂部控制欄按鈕文字
    const controlButtons = document.querySelectorAll('.control-btn');
    if (controlButtons[0]) controlButtons[0].textContent = t('customInterface');
    if (controlButtons[1]) controlButtons[1].textContent = t('exportData');
    if (controlButtons[2]) controlButtons[2].textContent = t('importData');
    if (controlButtons[3]) controlButtons[3].textContent = t('clearAllData');
    if (controlButtons[4]) controlButtons[4].textContent = t('saveData');
    
    // 確保按鈕狀態正確顯示
    updateSaveButtonStates();
    setupKeyboardShortcuts();

}

// ===== 統一的統計管理器 =====
class StatsManager {
    // 計算文字統計（字數和token數）
    static calculateTextStats(text) {
        if (!text) return { chars: 0, tokens: 0 };
        const chars = text.length;
        const tokens = countTokens(text);
        return { chars, tokens };
    }
    
    // 計算版本統計（根據類型）
    static calculateVersionStats(version, type) {
        let allText = '';
        let extraInfo = '';
        
        switch (type) {
            case 'character':
                allText = [
                    version.description, 
                    version.personality, 
                    version.scenario, 
                    version.dialogue, 
                    version.firstMessage
                ].filter(Boolean).join(' ');
                break;
                
            case 'custom':
                allText = version.fields.map(field => field.content).filter(Boolean).join(' ');
                break;
                
            case 'worldbook':
                const entryCount = version.entries.length;
                allText = version.entries.map(entry => entry.content).filter(Boolean).join(' ');
                extraInfo = `${entryCount}${t('entriesCount')} / `;
                break;
        }
        
        const { chars, tokens } = this.calculateTextStats(allText);
        return {
            chars,
            tokens,
            allText,
            extraInfo,
            formatted: `${extraInfo}${chars}${t('chars')} / ${tokens}${t('tokens')}`
        };
    }
    
    // 格式化統計顯示（用於不同場景）
    static formatStats(chars, tokens, options = {}) {
        const { showTokens = true, showChars = true, separator = ' / ' } = options;
        
        if (!showTokens) {
            return `${chars} ${t('chars')}`;
        }
        
        if (!showChars) {
            return `${tokens} ${t('tokens')}`;
        }
        
        return `${chars} ${t('chars')}${separator}${tokens} ${t('tokens')}`;
    }

    // 批量更新統計顯示
    static updateStatsElements() {
        const statsElements = document.querySelectorAll('.field-stats');
        statsElements.forEach(element => {
            const textareaId = element.dataset.target;
            const textarea = document.getElementById(textareaId);
            if (textarea) {
                const { chars, tokens } = this.calculateTextStats(textarea.value);
                
                // 檢查是否為不顯示token的欄位
                const excludeTokenFields = ['creator-', 'charVersion-', 'creatorNotes-', 'tags-'];
                const shouldShowTokens = !excludeTokenFields.some(prefix => textareaId.includes(prefix));
                
                element.textContent = this.formatStats(chars, tokens, { showTokens: shouldShowTokens });
            }
        });
    }
    
    // 更新版本統計顯示
    static updateVersionStats() {
        const allTypes = [
            { type: 'character', items: characters, currentId: currentCharacterId },
            { type: 'custom', items: customSections, currentId: currentCustomSectionId },
            { type: 'worldbook', items: worldBooks, currentId: currentWorldBookId }
        ];
        
        allTypes.forEach(({ type, items }) => {
            items.forEach(item => {
                item.versions.forEach(version => {
                    const statsElement = document.getElementById(`${type}-version-stats-${version.id}`);
                    if (statsElement) {
                        const stats = this.calculateVersionStats(version, type);
                        statsElement.textContent = t('versionStats', stats.chars, stats.tokens);
                    }
                });
            });
        });
    }

// 更新版本統計但保持時間戳顯示
static updateVersionStatsPreserveTimestamp() {
    const allTypes = [
        { type: 'character', items: characters },
        { type: 'custom', items: customSections },
        { type: 'worldbook', items: worldBooks }
    ];
    
    allTypes.forEach(({ type, items }) => {
        items.forEach(item => {
            item.versions.forEach(version => {
                const statsElement = document.getElementById(`${type}-version-stats-${version.id}`);
                if (statsElement) {
                    const stats = this.calculateVersionStats(version, type);
                    
                    // 檢查是否有時間戳結構，如果有就只更新統計文字
                    const statsText = statsElement.querySelector('.stats-text');
                    if (statsText) {
                        // 有時間戳結構，只更新統計部分
                        statsText.textContent = stats.formatted;
                    } else {
                        // 沒有時間戳結構，檢查是否需要添加
                        const hasTimestamp = version.updatedAt;
                        if (hasTimestamp) {
                            // 轉換為時間戳結構
                            const timestamp = this.formatTimestamp(version.updatedAt);
                            statsElement.style.display = 'flex';
statsElement.style.alignItems = 'center';
statsElement.style.paddingRight = '12px';
statsElement.innerHTML = `
    <span class="stats-text" style="flex: 1;">${stats.formatted}</span>
    <span class="timestamp-text" style="font-size: 0.75em; color: var(--text-muted); opacity: 0.8; margin-left: auto;">${timestamp}</span>
`;
                        } else {
                            // 無時間戳，正常更新
                            statsElement.textContent = stats.formatted;
                        }
                    }
                }
            });
        });
    });
}

// 修改現有的 updateVersionStats 方法，使其不會覆蓋時間戳
static updateVersionStats() {
    // 直接調用保持時間戳的版本
    this.updateVersionStatsPreserveTimestamp();
}
    
    // 更新側邊欄統計
    static updateSidebarStats() {
        const allTypes = [
            { type: 'character', items: characters },
            { type: 'custom', items: customSections },
            { type: 'worldbook', items: worldBooks }
        ];
        
        allTypes.forEach(({ type, items }) => {
            items.forEach(item => {
                item.versions.forEach(version => {
                    const versionElement = document.querySelector(
                        `[onclick="selectItem('${type}', '${item.id}', '${version.id}')"] span[style*="italic"]`
                    );
                    if (versionElement) {
                        const stats = this.calculateVersionStats(version, type);
                        versionElement.textContent = stats.formatted;
                    }
                });
            });
        });
    }

    // 計算總統計（單一檢視）
    static calculateTotalStatsForSingle() {
        const currentItem = ItemManager.getCurrentItem();
        const currentVersionId = ItemManager.getCurrentVersionId();
        
        if (!currentItem) return { chars: 0, tokens: 0 };
        
        const version = currentItem.versions.find(v => v.id === currentVersionId);
        if (!version) return { chars: 0, tokens: 0 };
        
        const stats = this.calculateVersionStats(version, currentMode);
        return { chars: stats.chars, tokens: stats.tokens };
    }
    
    // 計算總統計（對比檢視）
    static calculateTotalStatsForCompare() {
        const currentItem = ItemManager.getCurrentItem();
        if (!currentItem) return [];
        
        const versionsToCount = currentItem.versions.filter(v => compareVersions.includes(v.id));
        
        return versionsToCount.map(version => {
            const stats = this.calculateVersionStats(version, currentMode);
            return {
                name: version.name,
                chars: stats.chars,
                tokens: stats.tokens,
                formatted: stats.formatted
            };
        });
    }

    // 更新版本統計和時間戳顯示
    static updateVersionStatsWithTimestamp(itemType, itemId, versionId) {
        const statsElement = document.getElementById(`${itemType}-version-stats-${versionId}`);
        if (statsElement) {
            const item = ItemManager.getItemsArray(itemType).find(i => i.id === itemId);
            if (item) {
                const version = item.versions.find(v => v.id === versionId);
                if (version) {
                    const stats = this.calculateVersionStats(version, itemType);
                    const timestamp = TimestampManager.formatTimestamp(version.updatedAt);
                    
                    // 更新統計和時間戳
                    const statsText = statsElement.querySelector('.stats-text');
                    const timestampText = statsElement.querySelector('.timestamp-text');
                    
                    if (statsText) {
                        statsText.textContent = stats.formatted;
                    }
                    if (timestampText) {
                        timestampText.textContent = timestamp;
                    }
                }
            }
        }
    }

    // 批量更新所有版本統計和時間戳
    static updateAllVersionStatsWithTimestamp() {
        const allTypes = [
            { type: 'character', items: characters, currentId: currentCharacterId },
            { type: 'custom', items: customSections, currentId: currentCustomSectionId },
            { type: 'worldbook', items: worldBooks, currentId: currentWorldBookId }
        ];
        
        allTypes.forEach(({ type, items }) => {
            items.forEach(item => {
                item.versions.forEach(version => {
                    this.updateVersionStatsWithTimestamp(type, item.id, version.id);
                });
            });
        });
    }
}

// ===== 統一的UI工具管理器 =====
class UIUtils {
    // 創建標準的欄位組
    static createFieldGroup(config) {
        const hasStats = config.showStats !== false;
        const hasFullscreen = config.showFullscreen !== false;
        
        return `
            <div class="field-group" style="margin-bottom: ${config.marginBottom || '12px'};">
                <label class="field-label">
                    ${config.label}
                    ${hasStats ? `<span class="field-stats" data-target="${config.id}" style="margin-left: 12px; font-size: 0.85em; color: var(--text-muted);">0 ${t('chars')} / 0 ${t('tokens')}</span>` : ''}
                    ${hasFullscreen && config.type === 'textarea' ? `<button class="fullscreen-btn" onclick="openFullscreenEditor('${config.id}', '${config.label}')" title="全螢幕編輯" style="margin-left: 8px;">⛶</button>` : ''}
                </label>
                ${this.createInput(config)}
            </div>
        `;
    }
    
    // 創建輸入元素
    static createInput(config) {
        if (config.type === 'textarea') {
            return `<textarea class="field-input ${config.autoResize ? 'auto-resize' : ''} ${config.scrollable ? 'scrollable' : ''}" 
                             id="${config.id}" 
                             placeholder="${config.placeholder || ''}"
                             style="${config.style || 'resize: vertical;'}"
                             ${config.onChange ? `oninput="${config.onChange}"` : ''}>${config.value || ''}</textarea>`;
        } else {
            return `<input type="${config.type || 'text'}" 
                           class="field-input ${config.compact ? 'compact-input' : ''}" 
                           id="${config.id}"
                           placeholder="${config.placeholder || ''}"
                           value="${config.value || ''}"
                           ${config.min !== undefined ? `min="${config.min}"` : ''}
                           ${config.max !== undefined ? `max="${config.max}"` : ''}
                           ${config.onChange ? `onchange="${config.onChange}"` : ''}
                           ${config.style ? `style="${config.style}"` : ''}>`;
        }
    }
    
    // 創建按鈕組
    static createButtonGroup(buttons, options = {}) {
        const { gap = '8px', justify = 'flex-end', wrap = false } = options;
        
        const buttonHTML = buttons.map(btn => {
            const classes = ['btn', btn.type || 'btn-secondary', btn.size || ''].filter(Boolean).join(' ');
            return `<button class="${classes}" 
                            onclick="${btn.onClick}" 
                            ${btn.title ? `title="${btn.title}"` : ''}
                            ${btn.disabled ? 'disabled' : ''}
                            ${btn.style ? `style="${btn.style}"` : ''}>
                        ${btn.text}
                    </button>`;
        }).join('');
        
        return `
            <div style="display: flex; gap: ${gap}; justify-content: ${justify}; ${wrap ? 'flex-wrap: wrap;' : ''}">
                ${buttonHTML}
            </div>
        `;
    }

    // 創建表格標題列
static createTableHeader(columns) {
    const columnHTML = columns.map(col => 
        `<div style="${col.style || ''}">${col.title}</div>`
    ).join('');
    
    return `
        <div class="entry-header-labels" style="display: grid; grid-template-columns: ${columns.map(c => c.width).join(' ')}; gap: 8px; margin-bottom: 8px; padding: 0 12px; font-size: 0.75em; color: var(--text-muted); font-weight: 500; border-bottom: 1px solid var(--border-color); padding-bottom: 6px; align-items: center;">
            ${columnHTML}
        </div>
    `;
}
}

// ===== 版本管理工具 =====
class VersionUtils {
    // 生成版本圖示
    static getVersionIcon(version, type) {
        switch (type) {
            case 'character':
                return version.avatar ? 
                    `<img src="${version.avatar}" alt="Avatar" style="width: 25px; height: 25px; border-radius: 3px; object-fit: cover; object-position: center;">` : 
                    '';
            case 'worldbook':
            case 'custom':
            default:
                return '';
        }
    }
    
    // 生成唯一版本名稱
    static generateUniqueVersionName(item, baseName) {
        const existingNames = item.versions.map(v => v.name);
        let counter = 1;
        let finalName = baseName;
        
        while (existingNames.includes(finalName)) {
            finalName = `${baseName} (${counter})`;
            counter++;
        }
        
        return finalName;
    }
}

    // ===== 版本選擇管理器 =====
class VersionSelector {
    static selectedVersions = [];
    static currentModal = null;
    static maxSelections = 2;
    
    // 創建版本選擇模態框
    static create(config) {
        const { title, description, versions, onConfirm, maxSelections = 2 } = config;
        
        this.selectedVersions = [];
        this.maxSelections = maxSelections;
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        
        const versionCheckboxes = versions.map(version => `
            <div class="version-checkbox" data-version-id="${version.id}" onclick="VersionSelector.toggleSelection('${version.id}')">
                <input type="checkbox" id="check-${version.id}" style="pointer-events: none;">
                <label for="check-${version.id}" style="pointer-events: none; cursor: pointer;">${version.name}</label>
            </div>
        `).join('');
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">${title}</h3>
                    <button class="close-modal" onclick="VersionSelector.close()">×</button>
                </div>
                
                <p style="margin-bottom: 16px; color: var(--text-muted); font-size: 0.9em;">
                    ${description}
                    (<span style="color: var(--text-color); font-weight: 500;">${t('currentSelected') || '目前已選'}: <span id="selected-count">0</span>/${maxSelections}</span>)
                </p>
                
                <div class="version-checkboxes">
                    ${versionCheckboxes}
                </div>
                
                <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
                    <button class="btn btn-secondary" onclick="VersionSelector.close()">${t('cancel')}</button>
                    <button class="btn btn-primary" onclick="VersionSelector.confirm()" id="apply-compare" disabled>${t('startCompare') || '開始對比'}</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        this.currentModal = modal;
        this.onConfirm = onConfirm;
        
        this.updateUI();
        
        // 點擊外部關閉
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.close();
            }
        });
        
        return modal;
    }
    
    // 切換版本選擇狀態
    static toggleSelection(versionId) {
        const checkbox = document.getElementById(`check-${versionId}`);
        const container = document.querySelector(`[data-version-id="${versionId}"]`);
        
        if (!checkbox || !container) return;
        
        if (this.selectedVersions.includes(versionId)) {
            // 取消選擇
            checkbox.checked = false;
            container.classList.remove('selected');
            this.selectedVersions = this.selectedVersions.filter(id => id !== versionId);
        } else {
            // 新增選擇
            if (this.selectedVersions.length < this.maxSelections) {
                checkbox.checked = true;
                container.classList.add('selected');
                this.selectedVersions.push(versionId);
            } else {
                return; // 已達最大選擇數量
            }
        }
        
        this.updateUI();
    }
    
    // 更新UI狀態
    static updateUI() {
        const countElement = document.getElementById('selected-count');
        const applyButton = document.getElementById('apply-compare');
        
        if (countElement) {
            countElement.textContent = this.selectedVersions.length;
        }
        
        if (applyButton) {
            const shouldEnable = this.selectedVersions.length === this.maxSelections;
            applyButton.disabled = !shouldEnable;
            
            if (this.selectedVersions.length === 0) {
                applyButton.textContent = t('startCompare') || '開始對比';
            } else if (this.selectedVersions.length < this.maxSelections) {
                applyButton.textContent = `${t('needOneMore') || '還需選擇1個版本'}`;
            } else {
                applyButton.textContent = t('startCompare') || '開始對比';
            }
        }
        
        // 更新選項的視覺狀態
        const allVersionBoxes = document.querySelectorAll('.version-checkbox');
        allVersionBoxes.forEach(box => {
            const versionId = box.dataset.versionId;
            const isSelected = this.selectedVersions.includes(versionId);
            const checkbox = box.querySelector('input[type="checkbox"]');
            const label = box.querySelector('label');
            
            // 確保 checkbox 狀態正確
            if (checkbox) {
                checkbox.checked = isSelected;
            }
            
            // 更新視覺狀態
            if (isSelected) {
                box.classList.add('selected');
            } else {
                box.classList.remove('selected');
            }
            
            if (this.selectedVersions.length >= this.maxSelections && !isSelected) {
                // 已選滿且此項目未被選中 - 變灰色且禁用
                box.style.opacity = '0.4';
                box.style.pointerEvents = 'none';
                if (checkbox) checkbox.disabled = true;
                if (label) label.style.color = 'var(--text-muted)';
            } else {
                // 恢復正常狀態
                box.style.opacity = '1';
                box.style.pointerEvents = 'auto';
                if (checkbox) checkbox.disabled = false;
                if (label) label.style.color = '';
            }
        });
    }
    
    // 確認選擇
    static confirm() {
        if (this.selectedVersions.length >= this.maxSelections && this.onConfirm) {
            this.onConfirm(this.selectedVersions);
            this.close();
        }
    }
    
    // 關閉模態框
    static close() {
        if (this.currentModal) {
            this.currentModal.remove();
            this.currentModal = null;
        }
        this.selectedVersions = [];
        this.onConfirm = null;
    }

    // 向後兼容：支援舊的函數調用
    static showForCurrentMode() {
        let currentItem, versionsArray;
        
        if (currentMode === 'character') {
            currentItem = characters.find(c => c.id === currentCharacterId);
        } else if (currentMode === 'worldbook') {
            currentItem = worldBooks.find(wb => wb.id === currentWorldBookId);
        } else if (currentMode === 'custom') {
            currentItem = customSections.find(s => s.id === currentCustomSectionId);
        }
        
        if (!currentItem) return false;
        
        versionsArray = currentItem.versions || [];
        
        if (versionsArray.length <= 1) {
            alert(t('needTwoVersions'));
            return false;
        }
        
        compareVersions = [];
        
        this.create({
            title: t('selectVersionsToCompare') || '選擇要對比的版本',
            description: t('selectTwoVersions') || '選擇2個版本進行對比',
            versions: versionsArray,
            maxSelections: 2,
            onConfirm: (selectedVersions) => {
                compareVersions = selectedVersions;
                viewMode = 'compare';
                renderAll();
            }
        });
        
        return true;
    }
}

// ===== 時間戳管理器 =====
class TimestampManager {
    // 建立新的時間戳
    static createTimestamp() {
        return new Date().toISOString();
    }
    
    // 更新項目的時間戳（角色、世界書、筆記）
    static updateItemTimestamp(type, itemId) {
        const items = DataOperations.getItems(type);
        const item = items.find(i => i.id === itemId);
        if (item) {
            item.updatedAt = this.createTimestamp();
        }
    }
    
    // 更新版本的時間戳
    static updateVersionTimestamp(type, itemId, versionId) {
        const items = DataOperations.getItems(type);
        const item = items.find(i => i.id === itemId);
        if (item) {
            const version = item.versions.find(v => v.id === versionId);
            if (version) {
                version.updatedAt = this.createTimestamp();
                // 同時更新父項目的時間戳
                item.updatedAt = version.updatedAt;
            }
        }
    }
    
    // 格式化時間顯示
    static formatTimestamp(timestamp) {
        if (!timestamp) return '';
        
        const date = new Date(timestamp);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        
        const timeString = date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        
        if (targetDate.getTime() === today.getTime()) {
            return `Today, ${timeString}`;
        } else if (targetDate.getTime() === yesterday.getTime()) {
            return `Yesterday, ${timeString}`;
        } else {
            const dateString = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
            return `${dateString}, ${timeString}`;
        }
    }
    
    // 遷移舊資料：為沒有時間戳的資料補充時間戳
    static migrateOldData() {
        const now = this.createTimestamp();
        let migrationCount = 0;
        
        // 遷移角色資料
        characters.forEach(character => {
            if (!character.createdAt) {
                character.createdAt = now;
                character.updatedAt = now;
                migrationCount++;
            }
            
            character.versions.forEach(version => {
                if (!version.createdAt) {
                    version.createdAt = now;
                    version.updatedAt = now;
                    migrationCount++;
                }
            });
        });
        
        // 遷移自定義區塊資料
        customSections.forEach(section => {
            if (!section.createdAt) {
                section.createdAt = now;
                section.updatedAt = now;
                migrationCount++;
            }
            
            section.versions.forEach(version => {
                if (!version.createdAt) {
                    version.createdAt = now;
                    version.updatedAt = now;
                    migrationCount++;
                }
            });
        });
        
        // 遷移世界書資料
        worldBooks.forEach(worldBook => {
            if (!worldBook.createdAt) {
                worldBook.createdAt = now;
                worldBook.updatedAt = now;
                migrationCount++;
            }
            
            worldBook.versions.forEach(version => {
                if (!version.createdAt) {
                    version.createdAt = now;
                    version.updatedAt = now;
                    migrationCount++;
                }
            });
        });
        
        if (migrationCount > 0) {
            console.log(`📅 已為 ${migrationCount} 個項目補充時間戳`);
            saveData(); // 儲存遷移後的資料
        }
        
        return migrationCount;
    }
}

// ===== 啟動應用程式（最外層）=====
document.addEventListener('DOMContentLoaded', async () => {
    await initApp();
});