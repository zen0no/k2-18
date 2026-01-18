/**
 * K2-18 Knowledge Graph - Animation Controller Module
 * Manages node appearance animations and layout strategy
 * REFACTORED: Now uses Hierarchical/Planar approach instead of Force-Directed
 */

class AnimationController {
  constructor(cy, config = {}) {
    this.cy = cy;
    this.config = {
      levelDelay : 250,        // Delay between depth levels (ms)
      nodeAnimDuration : 600,  // Node fade-in duration (ms)
      edgeAnimDuration : 800,  // Edge fade-in duration (ms)
      edgeDelay : 100,         // Delay before showing edges (ms)
      layoutDuration : 1500,   // Layout adjustment duration (ms)
      animateOnLoad : true,    // Auto-animate on initialization
      ... config
    };

    this.isAnimating = false;
    this.animationPromise = null;
  }

  /**
   * Main animation sequence: Planar Setup -> Nodes -> Edges -> Fine Tuning
   * @returns {Promise} Resolves when animation completes
   */
  async animateGraph() {
    if (this.isAnimating) {
      console.log('Animation already in progress');
      return this.animationPromise;
    }

    this.isAnimating = true;
    console.log('Starting planar graph animation sequence...');

    try {
      // 1. Hide container to prevent flash
      const container = this.cy.container && this.cy.container();
      if (container) container.style.visibility = 'hidden';

      // 2. Pre-calculate Planar Positions (Grid based on Depth & Cluster)
      // This is crucial for avoiding the "hairball" look
      await this.applyPlanarPositions();

      // 3. Set initial invisible state
      this.hideAllElements();

      // 4. Show container (canvas is now visible but empty)
      if (container) container.style.visibility = 'visible';

      // 5. Animate Nodes Level by Level
      await this.animateNodesByDepth();

      // 6. Animate Edges
      await this.delay(this.config.edgeDelay);
      await this.animateEdges();

      // 7. Run Layout Fine-Tuning (Breadthfirst to untangle edges)
      await this.runHierarchicalLayout();

      console.log('Animation sequence completed');

    } catch (error) {
      console.error('Animation error:', error);
    } finally {
      this.isAnimating = false;
      this.animationPromise = null;
    }
  }

  /**
   * Manually positions nodes based on prerequisite_depth (Y-axis)
   * and cluster_id (X-axis grouping).
   */
  async applyPlanarPositions() {
    return new Promise(resolve = > {
      this.cy.batch(() = > {
        const depthGroups = {};

        // Group by depth
        this.cy.nodes().forEach(node = > {
          const depth = node.data('prerequisite_depth') || 0;
          if (!depthGroups[depth]) depthGroups[depth] = [];
          depthGroups[depth].push(node);
        });

        const depths = Object.keys(depthGroups).sort((a, b) = > a - b);

        // Config for grid
        const levelHeight = 180;  // Vertical distance between levels
        const nodeSpacing = 140;  // Horizontal distance between nodes

        depths.forEach((depth, rowIndex) = > {
          const nodes = depthGroups[depth];

          // Sort nodes within the level by cluster_id to keep topics together
          nodes.sort((a, b) = > {
            const clusterA = a.data('cluster_id') || 0;
            const clusterB = b.data('cluster_id') || 0;
            return clusterA - clusterB;
          });

          const rowWidth = nodes.length * nodeSpacing;
          const startX = -rowWidth / 2;  // Center the row

          nodes.forEach((node, colIndex) = > {
            // Apply position
            node.position({
              x : startX + (colIndex * nodeSpacing),
              y : rowIndex * levelHeight
            });

            // Store for reset
            node.data('initialPosition',
                      {x : node.position('x'), y : node.position('y')});
          });
        });
      });
      resolve();
    });
  }

  /**
   * Runs a directed layout algorithm to tidy up connections
   * while respecting the hierarchy established above.
   */
  async runHierarchicalLayout() {
    console.log('Running hierarchical layout fine-tuning...');

    return new Promise(resolve = > {
      // 'breadthfirst' is built-in and perfect for directed graphs
      // (trees/hierarchies)
      const layout = this.cy.layout({
        name : 'breadthfirst',
        directed : true,  // Ensures arrows point down/forward
        padding : 30,
        spacingFactor : 1.25,  // Spread nodes out a bit
        avoidOverlap : true,
        animate : true,
        animationDuration : this.config.layoutDuration,
        animationEasing : 'ease-out-cubic',
        nodeDimensionsIncludeLabels : true,
        // We lock the 'level' roughly by using the current positions as hints
        grid : true,
        stop : resolve
      });

      layout.run();
    });
  }

  hideAllElements() {
    this.cy.batch(
        () = > { this.cy.elements().style({'opacity' : 0, 'events' : 'no'}); });
  }

  groupNodesByDepth() {
    const groups = {};
    this.cy.nodes().forEach(node = > {
      const depth = node.data('prerequisite_depth') || 0;
      if (!groups[depth]) groups[depth] = [];
      groups[depth].push(node);
    });
    return groups;
  }

  animateNode(node) {
    return new Promise(resolve = > {
      const difficulty = node.data('difficulty') || 3;
      const targetOpacity = this.calculateOpacity(difficulty);

      // Root nodes appear faster
      const depth = node.data('prerequisite_depth') || 0;
      const duration = depth == = 0 ? 400 : this.config.nodeAnimDuration;

      node.animate({
        style : {'opacity' : targetOpacity},
        duration : duration,
        easing : 'ease-out-cubic',
        complete : resolve
      });
    });
  }

  calculateOpacity(difficulty) {
    const minOpacity = 0.6;  // Slightly higher visibility base
    const maxOpacity = 1.0;
    const normalized = (difficulty - 1) / 4;
    return minOpacity + (maxOpacity - minOpacity) * normalized;
  }

  async animateNodesByDepth() {
    const nodesByDepth = this.groupNodesByDepth();
    const depths = Object.keys(nodesByDepth).sort((a, b) = > a - b);

    console.log(`Animating ${depths.length} depth levels`);

    for (let i = 0; i < depths.length; i++) {
      const depth = depths[i];
      const nodes = nodesByDepth[depth];

      // Shuffle slightly for organic appearance within the level
      const shuffledNodes = [... nodes].sort(() = > Math.random() - 0.5);

      // Animate batch
      const animations = shuffledNodes.map(node = > this.animateNode(node));
      await Promise.all(animations);

      if (i < depths.length - 1) {
        await this.delay(this.config.levelDelay);
      }
    }

    this.cy.nodes().style('events', 'yes');
  }

  async animateEdges() {
    console.log(`Animating ${this.cy.edges().length} edges`);

    return new Promise(resolve = > {
      this.cy.batch(() = > {
        this.cy.edges().forEach(edge = > {
          const edgeType = edge.data('type');
          let targetOpacity = 0.6;

          if (window.EdgeStyles && window.EdgeStyles.EDGE_STYLES[edgeType]) {
            targetOpacity = window.EdgeStyles.EDGE_STYLES[edgeType].opacity;
          }

          edge.animate({
            style : {'opacity' : targetOpacity},
            duration : this.config.edgeAnimDuration,
            easing : 'ease-in-out'
          });
        });
      });
      setTimeout(resolve, this.config.edgeAnimDuration);
    });
  }

  delay(ms) { return new Promise(resolve = > setTimeout(resolve, ms)); }

  stopAnimation() {
    if (this.isAnimating) {
      this.cy.stop();
      this.isAnimating = false;
      // Force show
      this.cy.nodes().style('opacity', 1);
      this.cy.edges().style('opacity', 0.6);
      this.cy.nodes().style('events', 'yes');
    }
  }

  reset() {
    this.stopAnimation();
    this.hideAllElements();
  }

  async highlightPath(nodeIds, options = {}) {
    const config = {
      stepDelay : 300,
      highlightDuration : 500,
      dimOthers : true,
      ... options
    };

    if (config.dimOthers) {
      this.cy.elements().addClass('dimmed');
    }

    for (let i = 0; i < nodeIds.length; i++) {
      const node = this.cy.getElementById(nodeIds[i]);
      if (node.length == = 0) continue;

      node.removeClass('dimmed').addClass('highlighted');

      if (i < nodeIds.length - 1) {
        const nextNode = this.cy.getElementById(nodeIds[i + 1]);
        const edge = node.edgesWith(nextNode);
        edge.removeClass('dimmed').addClass('highlighted');
      }

      await this.delay(config.stepDelay);
    }
  }

  clearHighlights() { this.cy.elements().removeClass('highlighted dimmed'); }
}

if (typeof module != = 'undefined' && module.exports) {
  module.exports = AnimationController;
}
if (typeof window != = 'undefined') {
  window.AnimationController = AnimationController;
}