/**
 * K2-18 Knowledge Graph - Core Visualization Module
 * Handles Cytoscape initialization and base styling
 * FIXED: Edge hover highlighting priority
 */

class GraphCore {
  constructor(container, config = {}) {
    this.container = container;
    this.config = this.mergeConfig(config);
    this.cy = null;
    this.graphData = null;
    this.conceptData = null;
  }

  mergeConfig(userConfig) {
    const defaults = {
      // Node visual encoding
      nodeShapes : {
        'Chunk' : 'hexagon',
        'Concept' : 'star',
        'Assessment' : 'roundrectangle'
      },
      nodeColors : {
        'Chunk' : '#3498db',
        'Concept' : '#2ecc71',
        'Assessment' : '#f39c12'
      },
      // Size mapping
      minNodeSize : 20,
      maxNodeSize : 60,
      // Opacity mapping
      minOpacity : 0.5,
      maxOpacity : 1.0,
      // Animation configs
      animationDuration : 500,
      physicsDuration : 2000,
      // Layout - Planar default
      initialLayout : 'breadthfirst',
      // Labels
      showLabelsOnHover : true,
      animateOnLoad : true
    };
    return {... defaults, ... userConfig};
  }

  async initialize(graphData, conceptData) {
    this.graphData = graphData;
    this.conceptData = conceptData;

    // Prepare elements
    const elements = this.prepareElements();

    // Generate styles
    const styles = this.generateStyles();

    // Initialize Cytoscape
    this.cy = cytoscape({
      container : this.container,
      elements : elements,
      style : styles,
      layout : this.getLayoutConfig(),
      wheelSensitivity : 0.2,
      minZoom : 0.1,
      maxZoom : 5
    });

    // Setup Animation Controller
    if (window.AnimationController) {
      this.animationController = new window.AnimationController(this.cy, {
        levelDelay : 200,
        nodeAnimDuration : 500,
        edgeAnimDuration : 500,
        physicsDuration : this.config.physicsDuration,
        animateOnLoad : this.config.animateOnLoad
      });

      if (this.config.animateOnLoad) {
        await this.animationController.animateGraph();
      }
    } else if (this.config.animateOnLoad) {
      await this.animateAppearance();
    }

    // Emit ready event
    const event = new CustomEvent('k2-graph-ready',
                                  {detail : {cy : this.cy, graphCore : this}});
    document.dispatchEvent(event);

    return this.cy;
  }

  prepareElements() {
    const elements = {nodes : [], edges : []};

    this.graphData.nodes.forEach(node = > {
      elements.nodes.push({
        data : {
          id : node.id,
          label : this.truncateLabel(node.text || node.id),
          fullText : node.text,
          type : node.type,
          difficulty : node.difficulty || 3,
          pagerank : node.pagerank || 0.01,
          cluster_id : node.cluster_id,
          bridge_score : node.bridge_score || 0,
          prerequisite_depth : node.prerequisite_depth || 0,
          ... node
        },
        classes : node.type.toLowerCase()
      });
    });

    this.graphData.edges.forEach(edge = > {
      elements.edges.push({
        data : {
          id : `${edge.source} - ${edge.target}`,
          source : edge.source,
          target : edge.target,
          type : edge.type,
          weight : edge.weight || 0.5,
          is_inter_cluster_edge : edge.is_inter_cluster_edge || false,
          ... edge
        }
      });
    });

    return elements;
  }

  generateStyles() {
    // 1. BASE STYLES
    const styles = [
      {
        selector : 'node',
        style : {
          'opacity' : 0,  // Starts hidden for animation
          'label' : '',
          'background-opacity' : (ele) = > this.calculateOpacity(ele),
          'width' : (ele) = > this.calculateNodeSize(ele),
          'height' : (ele) = > this.calculateNodeSize(ele),
          'border-width' : 2,
          'border-color' : '#ffffff',
          'border-opacity' : 0.8,
          'transition-property' :
              'background-opacity, background-color, border-width',
          'transition-duration' : '200ms'
        }
      },
      // Node Types
      {
        selector : 'node.chunk',
        style : {
          'shape' : this.config.nodeShapes['Chunk'],
          'background-color' : this.config.nodeColors['Chunk']
        }
      },
      {
        selector : 'node.concept',
        style : {
          'shape' : this.config.nodeShapes['Concept'],
          'background-color' : this.config.nodeColors['Concept']
        }
      },
      {
        selector : 'node.assessment',
        style : {
          'shape' : this.config.nodeShapes['Assessment'],
          'background-color' : this.config.nodeColors['Assessment']
        }
      },
      // Node States (Selection/Highlight)
      {
        selector : 'node:selected',
        style : {'border-width' : 4, 'border-color' : '#f39c12'}
      },
      {
        selector : 'node.hover-highlight',
        style : {
          'background-color' : '#e74c3c',
          'border-width' : 3,
          'z-index' : 9999
        }
      },
      {
        selector : 'node.pulse',
        style : {
          'background-color' : '#e74c3c',
          'border-width' : 3,
          'z-index' : 9999
        }
      },
      // Base Edge Style
      {
        selector : 'edge',
        style : {
          'width' : 2,
          'line-color' : '#95a5a6',
          'target-arrow-shape' : 'triangle',
          'target-arrow-color' : '#95a5a6',
          'arrow-scale' : 1.2,
          'curve-style' : 'bezier',  // Important for planar look
          'control-point-step-size' : 40,
          'opacity' : 0
        }
      }
    ];

    // 2. IMPORT EXTERNAL EDGE STYLES (colors by type)
    // These come second, so they override the base edge style
    if (window.EdgeStyles && window.EdgeStyles.generateEdgeStyles) {
      const edgeStyles =
          window.EdgeStyles.generateEdgeStyles({interClusterMultiplier : 1.5});
      styles.push(... edgeStyles);
    }

    // 3. OVERRIDE STYLES (Hover, Dimmed)
    // These must be LAST to override the specific edge type colors
    styles.push(
        {
          selector : 'edge.hover-connected',
          style : {
            'line-color' : '#e74c3c',
            'target-arrow-color' : '#e74c3c',
            'source-arrow-color' : '#e74c3c',
            'opacity' : 1,
            'width' : 5,  // Slightly thicker on hover
            'z-index' : 999
          }
        },
        {selector : '.hidden, .hidden-edge', style : {'display' : 'none'}},
        {selector : '.dimmed', style : {'opacity' : 0.1}});

    return styles;
  }

  calculateNodeSize(ele) {
    const pagerank = ele.data('pagerank') || 0.01;
    const minSize = this.config.minNodeSize;
    const maxSize = this.config.maxNodeSize;
    const scaledValue = Math.log(pagerank * 1000 + 1) / Math.log(1000);
    return minSize + (maxSize - minSize) * Math.min(1, scaledValue);
  }

  calculateOpacity(ele) {
    const difficulty = ele.data('difficulty') || 3;
    const normalized = (difficulty - 1) / 4;
    return this.config.minOpacity +
           (this.config.maxOpacity - this.config.minOpacity) * normalized;
  }

  truncateLabel(text, maxLength = 30) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  getLayoutConfig() {
    return {
      name : 'breadthfirst',
      directed : true,
      circle : false,
      grid : true,
      spacingFactor : 1.75,
      avoidOverlap : true,
      animate : false,
      nodeDimensionsIncludeLabels : true
    };
  }

  async animateAppearance() {
    this.cy.nodes().style('opacity', 0);
    const nodes = this.cy.nodes();
    nodes.animate({style : {opacity : 1}, duration : 800});
    this.cy.edges().animate({style : {opacity : 0.6}, duration : 1000});
  }

  getStats() {
    return {
      nodes : this.cy.nodes().length,
      edges : this.cy.edges().length,
      nodeTypes : this.getNodeTypeCounts()
    };
  }

  getNodeTypeCounts() {
    const counts = {};
    this.cy.nodes().forEach(node = > {
      const type = node.data('type');
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }
}

window.GraphCore = GraphCore;