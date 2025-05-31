document.addEventListener('DOMContentLoaded', function() {
    const addButton = document.getElementById('addButton');
    const saveButton = document.getElementById('saveButton');
    const customColorButton = document.getElementById('customColorButton');
    const exportDataButton = document.getElementById('exportDataButton');
    const importDataButton = document.getElementById('importDataButton');
    const importCharacterButton = document.getElementById('importCharacterButton');
    const characterData = document.getElementById('characterData');

    // 新增按鈕：清除文字區域以創建新角色
    addButton.addEventListener('click', function() {
        characterData.value = '';
        alert('已準備好新增角色，請輸入資料！');
    });

    // 儲存按鈕：儲存文字區域內容
    saveButton.addEventListener('click', function() {
        const data = characterData.value.trim();
        if (data) {
            localStorage.setItem('characterData', data);
            alert('角色資料已儲存！');
        } else {
            alert('請輸入角色資料！');
        }
    });

    // 自訂顏色：簡單示例，改變背景顏色
    customColorButton.addEventListener('click', function() {
        const color = prompt('輸入顏色（例如 #ff0000 表示紅色）：');
        if (color) {
            document.body.style.backgroundColor = color;
        }
    });

    // 匯出資料：下載文字為檔案
    exportDataButton.addEventListener('click', function() {
        const data = characterData.value.trim();
        if (data) {
            const blob = new Blob([data], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'character_data.txt';
            a.click();
            URL.revokeObjectURL(url);
        } else {
            alert('無資料可匯出！');
        }
    });

    // 匯入資料：讀取文字檔案
    importDataButton.addEventListener('click', function() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'text/plain';
        input.addEventListener('change', function() {
            const file = input.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    characterData.value = e.target.result;
                    alert('資料已匯入！');
                };
                reader.readAsText(file);
            }
        });
        input.click();
    });

    // 匯入角色：模擬角色卡匯入（支援文字輸入）
    importCharacterButton.addEventListener('click', function() {
        const input = prompt('輸入角色資料（例如：名稱: 角色A, 描述: 勇敢的冒險者）：');
        if (input) {
            characterData.value = input;
            alert('角色已匯入！');
        }
    });

    // 載入時檢查是否有儲存的資料
    const savedData = localStorage.getItem('characterData');
    if (savedData) {
        characterData.value = savedData;
    }
});
