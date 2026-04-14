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
      name: 'domain-does-not-depend-on-application',
      severity: 'error',
      from: {
        path: '^src/main/domain'
      },
      to: {
        path: '^src/main/application'
      }
    },
    {
      name: 'domain-does-not-depend-on-infrastructure',
      severity: 'error',
      from: {
        path: '^src/main/domain'
      },
      to: {
        path: '^src/main/infrastructure'
      }
    },
    {
      name: 'domain-does-not-depend-on-cli',
      severity: 'error',
      from: {
        path: '^src/main/domain'
      },
      to: {
        path: '^src/main/cli'
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
      name: 'application-does-not-depend-on-cli',
      severity: 'error',
      from: {
        path: '^src/main/application'
      },
      to: {
        path: '^src/main/cli'
      }
    },
    {
      name: 'infrastructure-does-not-depend-on-domain',
      severity: 'error',
      from: {
        path: '^src/main/infrastructure'
      },
      to: {
        path: '^src/main/domain'
      }
    },
    {
      name: 'infrastructure-does-not-depend-on-cli',
      severity: 'error',
      from: {
        path: '^src/main/infrastructure'
      },
      to: {
        path: '^src/main/cli'
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
