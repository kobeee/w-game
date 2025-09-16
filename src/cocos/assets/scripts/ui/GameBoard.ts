import { _decorator, Component, Node, Prefab, instantiate, Vec3, Layout } from 'cc';
import { LetterTile, TileState } from './LetterTile';

const { ccclass, property } = _decorator;

interface GridPosition {
    row: number;
    col: number;
}

@ccclass('GameBoard')
export class GameBoard extends Component {
    @property
    rows: number = 4;

    @property
    cols: number = 4;

    @property(Prefab)
    tilePrefab: Prefab = null!;

    @property(Node)
    container: Node = null!;

    private tiles: LetterTile[][] = [];
    private selectedPath: GridPosition[] = [];
    private currentTargetWord: string = '';
    private gridLetters: string[][] = [];

    // 8方向移动（上、下、左、右、左上、右上、左下、右下）
    private readonly directions: GridPosition[] = [
        { row: -1, col: 0 }, { row: 1, col: 0 },   // 上下
        { row: 0, col: -1 }, { row: 0, col: 1 },   // 左右
        { row: -1, col: -1 }, { row: -1, col: 1 }, // 左上、右上
        { row: 1, col: -1 }, { row: 1, col: 1 }    // 左下、右下
    ];

    protected onLoad(): void {
        this.setupContainer();
    }

    /**
     * 生成网格并嵌入目标词的可达路径
     * @param targetWord 目标单词
     */
    spawnGrid(targetWord: string): void {
        this.currentTargetWord = targetWord.toUpperCase();
        this.clearGrid();
        
        // 初始化网格字母数组
        this.gridLetters = Array(this.rows).fill(null).map(() => Array(this.cols).fill(''));
        
        // 生成可达路径
        const path = this.generateReachablePath(this.currentTargetWord);
        
        if (path.length === 0) {
            console.error('[GameBoard] 无法为单词生成可达路径:', this.currentTargetWord);
            return;
        }
        
        // 在路径上放置目标单词的字母
        for (let i = 0; i < path.length && i < this.currentTargetWord.length; i++) {
            const pos = path[i];
            this.gridLetters[pos.row][pos.col] = this.currentTargetWord[i];
        }
        
        // 填充其他位置的随机字母
        this.fillRandomLetters();
        
        // 创建UI瓦片
        this.createTileNodes();
        
        console.log('[GameBoard] 网格生成完成，目标词:', this.currentTargetWord);
        this.printGrid(); // 调试用
    }

    /**
     * 获取当前选择的字符串
     */
    getCurrentString(): string {
        return this.selectedPath.map(pos => this.gridLetters[pos.row][pos.col]).join('');
    }

    /**
     * 清空选择路径
     */
    clearSelection(): void {
        // 将所有选中的瓦片重置为可选择状态
        for (const pos of this.selectedPath) {
            const tile = this.tiles[pos.row][pos.col];
            if (tile) {
                tile.setState('selectable');
            }
        }
        
        this.selectedPath = [];
        this.updateSelectableStates();
        this.emitBoardChange();
    }

    /**
     * 重置所有瓦片为可选择状态
     */
    resetAllTiles(): void {
        this.clearSelection();
        
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const tile = this.tiles[row][col];
                if (tile) {
                    tile.setState('selectable');
                }
            }
        }
    }

    /**
     * 显示正确答案状态
     */
    showCorrectAnswer(): void {
        for (const pos of this.selectedPath) {
            const tile = this.tiles[pos.row][pos.col];
            if (tile) {
                tile.setState('correct');
            }
        }
    }

    /**
     * 显示错误答案状态
     */
    showWrongAnswer(): void {
        for (const pos of this.selectedPath) {
            const tile = this.tiles[pos.row][pos.col];
            if (tile) {
                tile.setState('wrong');
            }
        }
    }

    private setupContainer(): void {
        if (!this.container) {
            console.warn('[GameBoard] container节点未设置');
            return;
        }
        
        // 设置容器的Grid Layout组件
        let layout = this.container.getComponent(Layout);
        if (!layout) {
            layout = this.container.addComponent(Layout);
        }
        
        layout.type = Layout.Type.GRID;
        layout.startAxis = Layout.AxisDirection.HORIZONTAL;
        layout.constraint = Layout.Constraint.FIXED_COL;
        layout.constraintNum = this.cols;
        layout.spacingX = 10;
        layout.spacingY = 10;
    }

    private clearGrid(): void {
        this.selectedPath = [];
        
        // 清除现有瓦片
        if (this.container) {
            this.container.destroyAllChildren();
        }
        
        this.tiles = Array(this.rows).fill(null).map(() => Array(this.cols).fill(null));
    }

    private generateReachablePath(word: string): GridPosition[] {
        const maxAttempts = 100;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const path: GridPosition[] = [];
            
            // 随机选择起始位置
            const startRow = Math.floor(Math.random() * this.rows);
            const startCol = Math.floor(Math.random() * this.cols);
            path.push({ row: startRow, col: startCol });
            
            // 尝试生成路径
            let success = true;
            for (let i = 1; i < word.length; i++) {
                const currentPos = path[path.length - 1];
                const nextPositions = this.getAdjacentPositions(currentPos);
                
                // 过滤掉已经使用的位置
                const availablePositions = nextPositions.filter(pos => 
                    !path.some(usedPos => usedPos.row === pos.row && usedPos.col === pos.col)
                );
                
                if (availablePositions.length === 0) {
                    success = false;
                    break;
                }
                
                // 随机选择下一个位置
                const randomIndex = Math.floor(Math.random() * availablePositions.length);
                path.push(availablePositions[randomIndex]);
            }
            
            if (success) {
                console.log('[GameBoard] 成功生成路径:', path);
                return path;
            }
        }
        
        console.warn('[GameBoard] 无法生成可达路径，尝试了', maxAttempts, '次');
        return [];
    }

    private getAdjacentPositions(pos: GridPosition): GridPosition[] {
        const adjacent: GridPosition[] = [];
        
        for (const dir of this.directions) {
            const newRow = pos.row + dir.row;
            const newCol = pos.col + dir.col;
            
            if (this.isValidPosition(newRow, newCol)) {
                adjacent.push({ row: newRow, col: newCol });
            }
        }
        
        return adjacent;
    }

    private isValidPosition(row: number, col: number): boolean {
        return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
    }

    private fillRandomLetters(): void {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                if (this.gridLetters[row][col] === '') {
                    // 生成随机字母，避免与目标词字母相同以增加挑战性
                    let randomLetter: string;
                    do {
                        randomLetter = alphabet[Math.floor(Math.random() * alphabet.length)];
                    } while (this.currentTargetWord.includes(randomLetter) && Math.random() < 0.7);
                    
                    this.gridLetters[row][col] = randomLetter;
                }
            }
        }
    }

    private createTileNodes(): void {
        if (!this.tilePrefab || !this.container) {
            console.error('[GameBoard] tilePrefab或container未设置');
            return;
        }
        
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const tileNode = instantiate(this.tilePrefab);
                const tile = tileNode.getComponent(LetterTile);
                
                if (tile) {
                    tile.setChar(this.gridLetters[row][col]);
                    tile.setState('selectable');
                    
                    // 监听瓦片点击事件
                    tileNode.on('tile:clicked', this.onTileClicked.bind(this, row, col));
                    
                    this.tiles[row][col] = tile;
                }
                
                this.container.addChild(tileNode);
            }
        }
        
        this.updateSelectableStates();
    }

    private onTileClicked(row: number, col: number, tile: LetterTile): void {
        const position = { row, col };
        
        // 检查是否点击了已选择路径的最后一个瓦片（撤销操作）
        if (this.selectedPath.length > 0) {
            const lastPos = this.selectedPath[this.selectedPath.length - 1];
            if (lastPos.row === row && lastPos.col === col) {
                // 撤销最后一步
                this.selectedPath.pop();
                tile.setState('selectable');
                this.updateSelectableStates();
                this.emitBoardChange();
                return;
            }
        }
        
        // 检查是否是有效的下一步选择
        if (this.isValidNextSelection(position)) {
            this.selectedPath.push(position);
            tile.setState('highlight');
            this.updateSelectableStates();
            this.emitBoardChange();
        }
    }

    private isValidNextSelection(pos: GridPosition): boolean {
        // 如果没有选择任何瓦片，任意瓦片都可以作为起始
        if (this.selectedPath.length === 0) {
            return true;
        }
        
        // 检查是否已经选择过这个位置
        if (this.selectedPath.some(selectedPos => 
            selectedPos.row === pos.row && selectedPos.col === pos.col)) {
            return false;
        }
        
        // 检查是否与最后选择的瓦片相邻（8方向）
        const lastPos = this.selectedPath[this.selectedPath.length - 1];
        const adjacent = this.getAdjacentPositions(lastPos);
        
        return adjacent.some(adjPos => adjPos.row === pos.row && adjPos.col === pos.col);
    }

    private updateSelectableStates(): void {
        if (this.selectedPath.length === 0) {
            // 没有选择时，所有瓦片都可选择
            for (let row = 0; row < this.rows; row++) {
                for (let col = 0; col < this.cols; col++) {
                    const tile = this.tiles[row][col];
                    if (tile && tile.getState() !== 'highlight') {
                        tile.setState('selectable');
                    }
                }
            }
        } else {
            // 有选择时，只有相邻的瓦片可选择
            const lastPos = this.selectedPath[this.selectedPath.length - 1];
            const adjacentPositions = this.getAdjacentPositions(lastPos);
            
            for (let row = 0; row < this.rows; row++) {
                for (let col = 0; col < this.cols; col++) {
                    const tile = this.tiles[row][col];
                    if (!tile || tile.getState() === 'highlight') continue;
                    
                    const isAdjacent = adjacentPositions.some(pos => pos.row === row && pos.col === col);
                    const isNotSelected = !this.selectedPath.some(pos => pos.row === row && pos.col === col);
                    
                    if (isAdjacent && isNotSelected) {
                        tile.setState('selectable');
                    } else {
                        tile.setState('disabled');
                    }
                }
            }
        }
    }

    private emitBoardChange(): void {
        const currentString = this.getCurrentString();
        this.node.emit('board:change', currentString);
    }

    private printGrid(): void {
        console.log('[GameBoard] 当前网格:');
        for (let row = 0; row < this.rows; row++) {
            console.log(this.gridLetters[row].join(' '));
        }
    }
}