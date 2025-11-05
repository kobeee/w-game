/**
 * 网格坐标系统 - 坐标转换器
 *
 * 实现网格坐标到世界坐标的转换，遵循设计文档第6章的规范
 */

import { Vec2, Vec3 } from 'cc';
import { GRID_UNIT, Z_STEP, ALLOWED_OFFSETS } from '../data/StackTypes';

/**
 * 坐标转换工具类
 */
export class CoordinateMapper {
    /**
     * 验证偏移值是否合法
     * @param offset 偏移向量
     * @returns 是否合法
     */
    public static validateOffset(offset: Vec2): boolean {
        // ⚠️ 使用 indexOf 兼容较低的TypeScript版本（ES2015）
        return ALLOWED_OFFSETS.indexOf(offset.x) !== -1 && ALLOWED_OFFSETS.indexOf(offset.y) !== -1;
    }

    /**
     * 网格坐标转世界坐标
     * @param gridRow 网格行索引 (0-6)
     * @param gridCol 网格列索引 (0-6)
     * @param offset 偏移量 (x, y)
     * @param gridSize 网格大小 {rows, cols}
     * @returns 世界坐标 (Vec3)
     */
    public static gridToWorld(
        gridRow: number,
        gridCol: number,
        offset: Vec2,
        gridSize: { rows: number; cols: number }
    ): Vec3 {
        // 验证偏移值
        if (!this.validateOffset(offset)) {
            console.warn(
                `[CoordinateMapper] 偏移值不合法: (${offset.x}, ${offset.y}), 使用默认值 (0, 0)`
            );
            offset = new Vec2(0, 0);
        }

        // 计算网格中心在世界坐标系中的位置
        const centerRow = (gridSize.rows - 1) / 2; // 对于7×7网格，centerRow = 3
        const centerCol = (gridSize.cols - 1) / 2; // 对于7×7网格，centerCol = 3

        // 计算相对中心的偏移量（网格单位）
        const rowOffsetFromCenter = gridRow - centerRow;
        const colOffsetFromCenter = gridCol - centerCol;

        // 转换为世界坐标（像素单位）
        // X轴：列偏移 * 网格单元 + 偏移量
        // Y轴：行偏移 * 网格单元 + 偏移量
        const worldX = colOffsetFromCenter * GRID_UNIT + offset.x;
        const worldY = rowOffsetFromCenter * GRID_UNIT + offset.y;

        return new Vec3(worldX, worldY, 0);
    }

    /**
     * 世界坐标转网格坐标（反向转换，用于调试）
     * @param worldPos 世界坐标
     * @param gridSize 网格大小
     * @returns 网格坐标和偏移量 {row, col, offset}
     */
    public static worldToGrid(
        worldPos: Vec3,
        gridSize: { rows: number; cols: number }
    ): { row: number; col: number; offset: Vec2 } {
        const centerRow = (gridSize.rows - 1) / 2;
        const centerCol = (gridSize.cols - 1) / 2;

        // 计算相对于中心的偏移（像素）
        const offsetXInPixels = worldPos.x;
        const offsetYInPixels = worldPos.y;

        // 计算网格索引和偏移量
        const col = Math.round(offsetXInPixels / GRID_UNIT) + centerCol;
        const row = Math.round(offsetYInPixels / GRID_UNIT) + centerRow;

        // 计算偏移量
        const offsetX = offsetXInPixels - (col - centerCol) * GRID_UNIT;
        const offsetY = offsetYInPixels - (row - centerRow) * GRID_UNIT;

        return {
            row: row,
            col: col,
            offset: new Vec2(offsetX, offsetY)
        };
    }

    /**
     * 计算Z轴坐标（根据层级）
     * @param layer 层级 (0, 1, 2, ...)
     * @returns Z轴坐标
     */
    public static calculateZIndex(layer: number): number {
        return layer * Z_STEP;
    }

    /**
     * 批量转换网格坐标到世界坐标
     * @param gridPositions 网格位置数组 [{row, col, offset}]
     * @param gridSize 网格大小
     * @returns 世界坐标数组
     */
    public static batchGridToWorld(
        gridPositions: Array<{ row: number; col: number; offset: Vec2 }>,
        gridSize: { rows: number; cols: number }
    ): Vec3[] {
        return gridPositions.map((pos) =>
            this.gridToWorld(pos.row, pos.col, pos.offset, gridSize)
        );
    }

    /**
     * 计算网格单元的世界坐标范围（用于调试可视化）
     * @param gridRow 网格行索引
     * @param gridCol 网格列索引
     * @param gridSize 网格大小
     * @returns 矩形范围 {left, right, top, bottom}
     */
    public static getGridCellBounds(
        gridRow: number,
        gridCol: number,
        gridSize: { rows: number; cols: number }
    ): { left: number; right: number; top: number; bottom: number } {
        const center = this.gridToWorld(gridRow, gridCol, new Vec2(0, 0), gridSize);
        const halfUnit = GRID_UNIT / 2;

        return {
            left: center.x - halfUnit,
            right: center.x + halfUnit,
            top: center.y + halfUnit,
            bottom: center.y - halfUnit
        };
    }

    /**
     * 调试输出：打印坐标转换信息
     * @param gridRow 网格行
     * @param gridCol 网格列
     * @param offset 偏移量
     * @param gridSize 网格大小
     */
    public static debugPrint(
        gridRow: number,
        gridCol: number,
        offset: Vec2,
        gridSize: { rows: number; cols: number }
    ): void {
        const worldPos = this.gridToWorld(gridRow, gridCol, offset, gridSize);
        const reverseGrid = this.worldToGrid(worldPos, gridSize);

        
    }
}
