import { _decorator, Component, Prefab, Node, instantiate } from 'cc';
import { HINT_MAX_CONCURRENT } from '../config/word-validate';
import { DefinitionHintView } from './DefinitionHintView';
const { ccclass, property } = _decorator;

@ccclass('DefinitionHintPool')
export class DefinitionHintPool extends Component {
    @property(Prefab)
    public prefab: Prefab = null!;

    @property(Node)
    public root: Node = null!;

    private activeNodes: Node[] = [];
    private idleNodes: Node[] = [];

    public initialize(prefab: Prefab, root: Node): void {
        this.prefab = prefab;
        this.root = root;
    }

    public acquire(): Node {
        let node: Node;
        if (this.idleNodes.length > 0) {
            node = this.idleNodes.pop()!;
        } else {
            node = instantiate(this.prefab);
        }
        if (this.root) {
            this.root.addChild(node);
        } else {
            this.node.addChild(node);
        }
        node.active = true;
        // 确保视图组件存在（Prefab 未绑定脚本时自动补齐）
        if (!node.getComponent(DefinitionHintView)) {
            node.addComponent(DefinitionHintView);
        }
        this.activeNodes.push(node);
        // 控制并发数量
        if (this.activeNodes.length > HINT_MAX_CONCURRENT) {
            const oldest = this.activeNodes.shift();
            if (oldest && oldest.isValid) {
                const view = oldest.getComponent(DefinitionHintView);
                if (view) {
                    view.dismiss(() => this.release(oldest!));
                } else {
                    this.release(oldest);
                }
            }
        }
        return node;
    }

    public release(node: Node): void {
        const idx = this.activeNodes.indexOf(node);
        if (idx >= 0) {
            this.activeNodes.splice(idx, 1);
        }
        if (node && node.isValid) {
            node.removeFromParent();
            node.active = false;
            this.idleNodes.push(node);
        }
    }
}


