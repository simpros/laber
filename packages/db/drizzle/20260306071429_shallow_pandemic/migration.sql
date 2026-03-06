CREATE TABLE `core_config` (
	`id` text PRIMARY KEY,
	`key` text NOT NULL UNIQUE,
	`value` text NOT NULL,
	`is_secret` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `deployment_logs` (
	`id` text PRIMARY KEY,
	`stack_id` text,
	`is_core` integer DEFAULT false NOT NULL,
	`action` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`output` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_deployment_logs_stack_id_stacks_id_fk` FOREIGN KEY (`stack_id`) REFERENCES `stacks`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `repositories` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`branch` text DEFAULT 'main' NOT NULL,
	`ssh_private_key` text,
	`stacks_path` text DEFAULT 'stacks' NOT NULL,
	`last_synced_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stack_env_vars` (
	`id` text PRIMARY KEY,
	`stack_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`is_secret` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_stack_env_vars_stack_id_stacks_id_fk` FOREIGN KEY (`stack_id`) REFERENCES `stacks`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `stacks` (
	`id` text PRIMARY KEY,
	`repository_id` text NOT NULL,
	`name` text NOT NULL,
	`relative_path` text NOT NULL,
	`compose_file` text DEFAULT 'docker-compose.yaml' NOT NULL,
	`status` text DEFAULT 'discovered' NOT NULL,
	`network_name` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_stacks_repository_id_repositories_id_fk` FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL UNIQUE,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	CONSTRAINT `fk_session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`email` text NOT NULL UNIQUE,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);