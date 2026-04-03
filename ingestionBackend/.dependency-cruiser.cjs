module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: {
        circular: true
      }
    },
    {
      name: 'application-does-not-depend-on-adapters',
      severity: 'error',
      from: {
        path: '^src/main/application'
      },
      to: {
        path: '^src/main/adapters'
      }
    },
    {
      name: 'application-does-not-depend-on-infrastructure',
      severity: 'error',
      from: {
        path: '^src/main/application'
      },
      to: {
        path: '^src/main/infrastructure'
      }
    },
    {
      name: 'infrastructure-does-not-depend-on-adapters',
      severity: 'error',
      from: {
        path: '^src/main/infrastructure'
      },
      to: {
        path: '^src/main/adapters'
      }
    },
    {
      name: 'ports-do-not-depend-on-use-cases',
      severity: 'error',
      from: {
        path: '^src/main/application/ports'
      },
      to: {
        path: '^src/main/application/use-cases'
      }
    },
    {
      name: 'ports-do-not-depend-on-adapters',
      severity: 'error',
      from: {
        path: '^src/main/application/ports'
      },
      to: {
        path: '^src/main/adapters'
      }
    },
    {
      name: 'ports-do-not-depend-on-infrastructure',
      severity: 'error',
      from: {
        path: '^src/main/application/ports'
      },
      to: {
        path: '^src/main/infrastructure'
      }
    },
    {
      name: 'use-cases-no-adapters',
      severity: 'error',
      from: {
        path: '^src/main/application/use-cases'
      },
      to: {
        path: '^src/main/adapters'
      }
    },
    {
      name: 'use-cases-no-infrastructure',
      severity: 'error',
      from: {
        path: '^src/main/application/use-cases'
      },
      to: {
        path: '^src/main/infrastructure'
      }
    },
    {
      name: 'inbound-no-outbound',
      severity: 'error',
      from: {
        path: '^src/main/adapters/inbound'
      },
      to: {
        path: '^src/main/adapters/outbound'
      }
    },
    {
      name: 'outbound-no-inbound',
      severity: 'error',
      from: {
        path: '^src/main/adapters/outbound'
      },
      to: {
        path: '^src/main/adapters/inbound'
      }
    }
  ],
  options: {
    tsConfig: {
      fileName: 'tsconfig.json'
    },
    doNotFollow: {
      path: 'node_modules'
    },
    includeOnly: '^src/main',
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      mainFields: ['module', 'main', 'types', 'typings']
    },
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/[^/]+'
      }
    }
  }
};
