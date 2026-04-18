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
      name: 'config-does-not-depend-on-services',
      severity: 'error',
      from: {
        path: '^src/config'
      },
      to: {
        path: '^src/services'
      }
    },
    {
      name: 'services-do-not-depend-on-app-module',
      severity: 'error',
      from: {
        path: '^src/services'
      },
      to: {
        path: '^src/app\\.module\\.ts$'
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
    includeOnly: '^src',
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
