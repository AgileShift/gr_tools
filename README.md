# Grupo Real Tools

## Introduction

This document outlines our custom configuration strategy for our Frappe sites.  
We have adopted a unique approach that diverges from the standard use of **fixtures** and direct application of customizations through **hooks**.  

Instead, we opt for a custom JSON loaded as a type of fixture using the **_after_migrate_ hook**.

___

### Why We Do Not Use Standard Fixtures

Using fixtures in Frappe is a common practice for replicating configurations and data across multiple sites.
However, this approach poses limitations when managing site-specific configurations in a multitenant environment.
Standard fixtures overwrite existing configurations, potentially leading to the loss of critical site-specific customizations.
Moreover, fixtures do not offer a straightforward way to manage subtle differences between sites without replicating multiple versions of the same fixture.

### Why We Do Not Apply Customizations Directly Through Hooks

Applying customizations directly through individual hooks for each setting is another option.
However, this method can become cumbersome and difficult to maintain as the number of customizations grows.
Each customization would require its hook code, increasing the system's complexity and making cohesive management of configurations across multiple environments challenging.

___

## Our Solution: Custom JSON and after_migrate Hook

We decided to adopt a hybrid approach that combines the flexibility of fixtures with the precision of custom hooks.  
This approach involves creating a custom JSON that contains both general configurations applicable to all sites and site-specific configurations.  
We use the **after_migrate** hook to conditionally load and apply these configurations based on the current site.

### Advantages of Our Approach

1. **Flexibility**: Our custom JSON allows for easy adaptation to the specific needs of each site without compromising general configurations.
2. **Maintainability**: Centralizing configurations in a single JSON file facilitates updates and maintenance, reducing complexity.
3. **Efficient Automation**: Using the **after_migrate** hook to apply configurations ensures that each site is correctly configured automatically after each migration, minimizing the need for manual interventions.

### How It Works

1. **Preparation of Custom JSON**: We create a JSON file detailing the general and site-specific configurations.
2. **Use of after_migrate Hook**: In hooks.py, we specify a method to run after migration to read the custom JSON and apply the corresponding configurations to the current site.
3. **Conditional Application of Configurations**: The method identifies the current site, extracts the relevant configurations from the custom JSON, and applies them using Frappe's API.

**Conclusion**

Our decision to use a custom JSON loaded through the **after_migrate** hook represents a balance between the need for customization and operational efficiency.  
This approach allows us to manage configurations flexibly and keep our Frappe sites optimized and aligned with the specific requirements of each environment.
